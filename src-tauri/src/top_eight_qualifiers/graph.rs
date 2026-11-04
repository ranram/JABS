use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Node {
    pub id: String,
    round: i64,
    phase_order: i64,
    sources: Vec<(String, u64, bool)>,
    winner_seed: Option<String>,
    loser_seed: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Side {
    Winners,
    Losers,
}
impl Side {
    pub fn label(self) -> &'static str {
        match self {
            Self::Winners => "Top 8 Qualifier (W)",
            Self::Losers => "Top 8 Qualifier (L)",
        }
    }
}
pub(super) fn id(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.is_empty() && text.len() <= 128 => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}
impl Node {
    pub fn same_structure(&self, other: &Self) -> bool {
        self.id == other.id
            && self.round == other.round
            && self.phase_order == other.phase_order
            && self.sources == other.sources
    }
    pub fn parse(value: &Value) -> Option<Self> {
        let slots = value.get("slots")?.as_array()?;
        if slots.len() != 2 {
            return None;
        }
        Some(Self {
            id: id(value.get("id")?)?,
            round: value.get("round")?.as_i64()?,
            phase_order: value.pointer("/phaseGroup/phase/phaseOrder")?.as_i64()?,
            sources: slots
                .iter()
                .filter_map(|slot| {
                    let kind = slot.get("prereqType")?.as_str()?;
                    if !kind.eq_ignore_ascii_case("set") && !kind.eq_ignore_ascii_case("seed") {
                        return None;
                    }
                    let seed = kind.eq_ignore_ascii_case("seed");
                    // A seed's source placement comes from its unique producer.
                    let placement = if seed {
                        0
                    } else {
                        slot.get("prereqPlacement")?.as_u64()?
                    };
                    if !seed && !matches!(placement, 1 | 2) {
                        return None;
                    }
                    Some((id(slot.get("prereqId")?)?, placement, seed))
                })
                .collect(),
            winner_seed: value.pointer("/winnerProgressionSeed/id").and_then(id),
            loser_seed: value.pointer("/loserProgressionSeed/id").and_then(id),
        })
    }
}

// Walk the final double-elimination subtree before any Top 8 entrants are known.
// Entrant names and round labels are deliberately not used as structural evidence.
pub(super) fn detect(nodes: &HashMap<String, Node>, final_order: i64) -> HashMap<String, Side> {
    if nodes.values().any(|node| node.phase_order > final_order) {
        return HashMap::new();
    }
    let mut seeds: HashMap<&str, Vec<(&str, u64)>> = HashMap::new();
    for node in nodes.values() {
        for (seed, placement) in [(&node.winner_seed, 1), (&node.loser_seed, 2)] {
            if let Some(seed) = seed {
                seeds.entry(seed).or_default().push((&node.id, placement));
            }
        }
    }
    let sources: HashMap<&str, Vec<(&str, u64)>> = nodes
        .values()
        .map(|node| {
            let links = node
                .sources
                .iter()
                .filter_map(|(source, placement, seed)| {
                    if !seed {
                        return nodes
                            .contains_key(source)
                            .then_some((source.as_str(), *placement));
                    }
                    let producers = seeds.get(source.as_str())?;
                    (producers.len() == 1).then_some(producers[0])
                })
                .collect();
            (node.id.as_str(), links)
        })
        .collect();
    let inputs = |set: &str| sources.get(set).cloned().unwrap_or_default();
    let mut candidates = Vec::new();
    for final_set in nodes
        .values()
        .filter(|node| node.phase_order == final_order && node.round > 0)
    {
        let finals = inputs(&final_set.id);
        if finals.len() != 2 || finals.iter().any(|(_, place)| *place != 1) {
            continue;
        }
        let Some((wf, _)) = finals.iter().find(|(candidate, _)| {
            finals
                .iter()
                .any(|(other, _)| candidate != other && inputs(other).contains(&(*candidate, 2)))
        }) else {
            continue;
        };
        let Some((lf, _)) = finals.iter().find(|(candidate, _)| candidate != wf) else {
            continue;
        };
        let ws = inputs(wf);
        let lf_inputs = inputs(lf);
        if ws.len() != 2
            || ws
                .iter()
                .any(|(set, place)| *place != 1 || nodes[*set].round <= 0)
            || lf_inputs.len() != 2
            || !lf_inputs.contains(&(*wf, 2))
        {
            continue;
        }
        let Some((ls, _)) = lf_inputs
            .iter()
            .find(|(set, place)| set != wf && *place == 1)
        else {
            continue;
        };
        let lq = inputs(ls);
        if lq.len() != 2
            || lq
                .iter()
                .any(|(set, place)| *place != 1 || nodes[*set].round >= 0)
        {
            continue;
        }
        let mut opening = ws
            .iter()
            .map(|(set, _)| (*set, Side::Winners))
            .collect::<Vec<_>>();
        for (quarter, _) in lq {
            let links = inputs(quarter);
            if links.len() != 2
                || !links
                    .iter()
                    .any(|(set, place)| *place == 2 && ws.iter().any(|(winner, _)| winner == set))
            {
                break;
            }
            let Some((set, _)) = links
                .iter()
                .find(|(set, place)| *place == 1 && !ws.iter().any(|(winner, _)| winner == set))
            else {
                break;
            };
            if nodes[*set].round >= 0 {
                break;
            }
            opening.push((*set, Side::Losers));
        }
        if opening.len() != 4 {
            continue;
        }
        let opening_ids = opening.iter().map(|(id, _)| *id).collect::<HashSet<_>>();
        if opening_ids.len() != 4 {
            continue;
        }
        let mut labels = HashMap::new();
        let mut valid = true;
        for (set, side) in opening {
            let links = inputs(set);
            if links.len() != 2 {
                valid = false;
                break;
            }
            for (source, place) in links {
                let right_side = match side {
                    Side::Winners => nodes[source].round > 0,
                    Side::Losers => nodes[source].round < 0,
                };
                if place != 1
                    || !right_side
                    || opening_ids.contains(source)
                    || labels.insert(source.to_owned(), side).is_some()
                {
                    valid = false;
                    break;
                }
            }
        }
        if valid && labels.len() == 8 {
            candidates.push(labels);
        }
    }
    match candidates.first() {
        Some(first) if candidates.iter().all(|candidate| candidate == first) => first.clone(),
        _ => HashMap::new(),
    }
}
