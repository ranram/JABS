mod graph;
#[cfg(test)]
mod tests;

use crate::runtime::RuntimeState;
use graph::{Node, Side};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    future::Future,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const MAX_EVENTS: usize = 4;
const MAX_SETS: usize = 4096;
const PAGE_SIZE: usize = 100;
const CACHE_AGE: Duration = Duration::from_secs(300);
const RETRY_DELAY: Duration = Duration::from_secs(60);
const GRAPH_QUERY: &str = r#"
query QualifierStructure($eventId: ID!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    phases { phaseOrder phaseGroups(query: { page: 1, perPage: 1 }) { pageInfo { total } } }
    sets(page: $page, perPage: $perPage, sortType: STANDARD) {
      pageInfo { total totalPages }
      nodes {
        id round
        phaseGroup { phase { phaseOrder } }
        winnerProgressionSeed { id }
        loserProgressionSeed { id }
        slots { prereqId prereqPlacement prereqType }
      }
    }
  }
}
"#;

struct Event {
    id: String,
    nodes: HashMap<String, Node>,
    final_order: Option<i64>,
    final_groups: Option<u64>,
    labels: HashMap<String, Side>,
    complete: bool,
    refreshed: Option<Instant>,
    attempted: Option<Instant>,
    pagination: Option<(u64, u64)>,
    pages: HashSet<u64>,
}
impl Event {
    fn new(id: &str) -> Self {
        Self {
            id: id.into(),
            nodes: HashMap::new(),
            final_order: None,
            final_groups: None,
            labels: HashMap::new(),
            complete: false,
            refreshed: None,
            attempted: None,
            pagination: None,
            pages: HashSet::new(),
        }
    }
    fn classify(&mut self) {
        self.labels = if self.complete && self.final_groups == Some(1) {
            self.final_order
                .map(|order| graph::detect(&self.nodes, order))
                .unwrap_or_default()
        } else {
            HashMap::new()
        };
    }
}
#[derive(Default)]
pub struct Cache {
    events: Mutex<VecDeque<Event>>,
}
fn event<'a>(events: &'a mut VecDeque<Event>, id: &str) -> &'a mut Event {
    let value = events
        .iter()
        .position(|entry| entry.id == id)
        .and_then(|index| events.remove(index))
        .unwrap_or_else(|| Event::new(id));
    if events.len() == MAX_EVENTS {
        events.pop_front();
    }
    events.push_back(value);
    events.back_mut().unwrap()
}
impl Cache {
    pub async fn observe_phases(&self, id: &str, phases: &[&Value]) {
        let scope = phase_scope(phases);
        let mut events = self.events.lock().await;
        let entry = event(&mut events, id);
        let (order, groups) =
            scope.map_or((None, None), |(order, groups)| (Some(order), Some(groups)));
        if (entry.final_order, entry.final_groups) != (order, groups) {
            if entry.final_order.is_some() && entry.final_groups.is_some() {
                entry.complete = false;
                entry.attempted = None;
            }
            entry.final_order = order;
            entry.final_groups = groups;
            entry.classify();
        }
    }

    pub async fn observe_sets(&self, id: &str, nodes: &[&Value], full_event: bool, page: &Value) {
        let mut events = self.events.lock().await;
        let entry = event(&mut events, id);
        let was_complete = entry.complete;
        let mut changed = false;
        for value in nodes {
            let Some(node) = Node::parse(value) else {
                continue;
            };
            if entry
                .nodes
                .get(&node.id)
                .is_some_and(|saved| saved.same_structure(&node))
            {
                continue;
            }
            changed = true;
            if entry.nodes.len() >= MAX_SETS && !entry.nodes.contains_key(&node.id) {
                entry.complete = false;
                entry.labels.clear();
                return;
            }
            entry.nodes.insert(node.id.clone(), node);
        }
        if changed {
            entry.complete = false;
            entry.attempted = None;
        }
        if full_event {
            if let (Some(number), Some(size), Some(total)) = (
                page["page"].as_u64(),
                page["perPage"].as_u64(),
                page["totalPages"].as_u64(),
            ) {
                if number == 0 || number > total || size == 0 || total > MAX_SETS as u64 {
                    entry.complete = false;
                    entry.labels.clear();
                    return;
                }
                if number == 1 || entry.pagination != Some((size, total)) {
                    entry.pages.clear();
                }
                entry.pagination = Some((size, total));
                entry.pages.insert(number);
                if total > 0 && total <= MAX_SETS as u64 && entry.pages.len() as u64 == total {
                    entry.complete = true;
                    entry.refreshed = Some(Instant::now());
                }
            }
        }
        if changed || (!was_complete && entry.complete) {
            entry.classify();
        }
    }
    pub async fn label(
        &self,
        runtime: &RuntimeState,
        event_id: &str,
        set_id: &str,
    ) -> Option<&'static str> {
        self.load(event_id, set_id, || async {
            tokio::time::timeout(Duration::from_secs(8), fetch(runtime, event_id))
                .await
                .ok()
                .flatten()
        })
        .await
        .map(Side::label)
    }
    async fn load<F, Fut>(&self, event_id: &str, set_id: &str, fetch: F) -> Option<Side>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Option<(HashMap<String, Node>, i64, u64)>>,
    {
        // One in-flight analysis is shared by selection, quick reporting, and queue advancement.
        let mut events = self.events.lock().await;
        let entry = event(&mut events, event_id);
        if entry.complete
            && entry.final_order.is_some()
            && entry.final_groups.is_some()
            && entry.refreshed.is_some_and(|at| at.elapsed() < CACHE_AGE)
        {
            return entry.labels.get(set_id).copied();
        }
        if entry.attempted.is_some_and(|at| at.elapsed() < RETRY_DELAY) {
            return None;
        }
        entry.attempted = Some(Instant::now());
        let Some((nodes, final_order, final_groups)) = fetch().await else {
            return None;
        };
        entry.nodes = nodes;
        entry.final_order = Some(final_order);
        entry.final_groups = Some(final_groups);
        entry.complete = true;
        entry.refreshed = Some(Instant::now());
        entry.classify();
        entry.labels.get(set_id).copied()
    }
}
async fn fetch(
    runtime: &RuntimeState,
    event_id: &str,
) -> Option<(HashMap<String, Node>, i64, u64)> {
    let mut nodes = HashMap::new();
    let mut seen = HashSet::new();
    let mut pages = 1;
    let mut page = 1;
    let mut scope = None;
    let mut expected_total = None;
    while page <= pages {
        let data: Value = crate::startgg::request(
            runtime,
            GRAPH_QUERY,
            json!({"eventId":event_id, "page":page, "perPage":PAGE_SIZE}),
        )
        .await
        .ok()?;
        let event = data.get("event")?;
        let phases = event.get("phases")?.as_array()?;
        let next_scope = phase_scope(&phases.iter().collect::<Vec<_>>())?;
        if scope.is_some_and(|saved| saved != next_scope) {
            return None;
        }
        scope = Some(next_scope);
        let sets = event.get("sets")?;
        let total = sets.pointer("/pageInfo/total")?.as_u64()?;
        if total == 0
            || total > MAX_SETS as u64
            || expected_total.is_some_and(|saved| saved != total)
        {
            return None;
        }
        expected_total = Some(total);
        pages = sets.pointer("/pageInfo/totalPages")?.as_u64()?;
        if pages == 0 || pages > MAX_SETS.div_ceil(PAGE_SIZE) as u64 {
            return None;
        }
        for value in sets.get("nodes")?.as_array()? {
            if !seen.insert(graph::id(value.get("id")?)?) {
                return None;
            }
            if let Some(node) = Node::parse(value) {
                nodes.insert(node.id.clone(), node);
            }
        }
        page += 1;
    }
    if Some(seen.len() as u64) != expected_total {
        return None;
    }
    let (order, groups) = scope?;
    Some((nodes, order, groups))
}

fn phase_scope(phases: &[&Value]) -> Option<(i64, u64)> {
    let latest = phases
        .iter()
        .filter_map(|phase| phase.get("phaseOrder")?.as_i64())
        .max()?;
    let mut finals = phases
        .iter()
        .filter(|phase| phase.get("phaseOrder").and_then(Value::as_i64) == Some(latest));
    let phase = finals.next()?;
    if finals.next().is_some() {
        return None;
    }
    Some((
        latest,
        phase.pointer("/phaseGroups/pageInfo/total")?.as_u64()?,
    ))
}
