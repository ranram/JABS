use super::*;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

fn raw(id: &str, round: i64, order: i64, links: &[(&str, u64)]) -> Value {
    let mut slots = links
        .iter()
        .map(|(id, place)| json!({"prereqType":"set", "prereqId":id,"prereqPlacement":place}))
        .collect::<Vec<_>>();
    while slots.len() < 2 {
        slots.push(json!({}));
    }
    json!({"id":id,"round":round,"phaseGroup":{"phase":{"phaseOrder":order}},"slots":slots})
}
fn fixture() -> Vec<Value> {
    let mut nodes = Vec::new();
    for (id, round) in [
        ("w1", 1),
        ("w2", 1),
        ("w3", 1),
        ("w4", 1),
        ("l1", -2),
        ("l2", -2),
        ("l3", -2),
        ("l4", -2),
    ] {
        nodes.push(raw(id, round, 1, &[]));
    }
    nodes.extend([
        raw("ws1", 1, 2, &[("w1", 1), ("w2", 1)]),
        raw("ws2", 1, 2, &[("w3", 1), ("w4", 1)]),
        raw("lo1", -1, 2, &[("l1", 1), ("l2", 1)]),
        raw("lo2", -1, 2, &[("l3", 1), ("l4", 1)]),
        raw("q1", -2, 2, &[("ws1", 2), ("lo1", 1)]),
        raw("q2", -2, 2, &[("ws2", 2), ("lo2", 1)]),
        raw("wf", 2, 2, &[("ws1", 1), ("ws2", 1)]),
        raw("ls", -3, 2, &[("q1", 1), ("q2", 1)]),
        raw("lf", -4, 2, &[("wf", 2), ("ls", 1)]),
        raw("gf", 3, 2, &[("wf", 1), ("lf", 1)]),
        raw("reset", 4, 2, &[("gf", 1), ("gf", 2)]),
    ]);
    nodes
}
fn parse(values: &[Value]) -> HashMap<String, Node> {
    values
        .iter()
        .filter_map(Node::parse)
        .map(|node| (node.id.clone(), node))
        .collect()
}
#[test]
fn identifies_qualification_before_entrants_are_known_and_rejects_ambiguous_or_incomplete_graphs() {
    let values = fixture();
    let labels = graph::detect(&parse(&values), 2);
    assert_eq!(labels.len(), 8);
    for id in ["w1", "w2", "w3", "w4"] {
        assert_eq!(labels[id], Side::Winners);
    }
    for id in ["l1", "l2", "l3", "l4"] {
        assert_eq!(labels[id], Side::Losers);
    }
    assert_eq!(Side::Winners.label(), "Top 8 Qualifier (W)");
    assert_eq!(Side::Losers.label(), "Top 8 Qualifier (L)");
    for id in ["w1", "lo1", "lf"] {
        let mut nodes = parse(&values);
        nodes.remove(id);
        assert!(graph::detect(&nodes, 2).is_empty());
    }
    // An earlier pool's final eight are not the event's Top 8.
    assert!(graph::detect(&parse(&values), 3).is_empty());
    assert!(graph::detect(&parse(&values), 1).is_empty());
    let mut ambiguous = parse(&values);
    let renamed = serde_json::to_string(&values).unwrap();
    let mut other: Vec<Value> = serde_json::from_str(&renamed).unwrap();
    for node in &mut other {
        node["id"] = json!(format!("other-{}", node["id"].as_str().unwrap()));
        for slot in node["slots"].as_array_mut().unwrap() {
            if let Some(id) = slot.get("prereqId").and_then(Value::as_str) {
                slot["prereqId"] = json!(format!("other-{id}"));
            }
        }
    }
    ambiguous.extend(parse(&other));
    assert!(graph::detect(&ambiguous, 2).is_empty());
    assert!(graph::detect(&parse(&[raw("single-final", 1, 2, &[])]), 2).is_empty());
}
#[test]
fn follows_unique_progression_seeds_across_phases_and_rejects_conflicting_seed_sources() {
    let mut values = fixture();
    for node in &mut values {
        let id = node["id"].as_str().unwrap().to_owned();
        if ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"].contains(&id.as_str()) {
            node["winnerProgressionSeed"] = json!({"id":format!("seed-{id}")});
        }
        if ["ws1", "ws2", "lo1", "lo2"].contains(&id.as_str()) {
            for slot in node["slots"].as_array_mut().unwrap() {
                slot["prereqType"] = json!("seed");
                slot.as_object_mut().unwrap().remove("prereqPlacement");
                slot["prereqId"] = json!(format!("seed-{}", slot["prereqId"].as_str().unwrap()));
            }
        }
    }
    assert_eq!(graph::detect(&parse(&values), 2).len(), 8);
    let mut duplicate = raw("duplicate", 1, 1, &[]);
    duplicate["winnerProgressionSeed"] = json!({"id":"seed-w1"});
    values.push(duplicate);
    assert!(graph::detect(&parse(&values), 2).is_empty());
}
#[tokio::test]
async fn caches_success_and_failure_per_event_and_reuses_complete_browsed_data() {
    let cache = Cache::default();
    let calls = Arc::new(AtomicUsize::new(0));
    let nodes = parse(&fixture());
    for _ in 0..3 {
        let count = calls.clone();
        let graph = nodes.clone();
        assert_eq!(
            cache
                .load("event", "w1", || async move {
                    count.fetch_add(1, Ordering::SeqCst);
                    Some((graph, 2, 1))
                })
                .await,
            Some(Side::Winners)
        );
    }
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let mut events = cache.events.lock().await;
    let cached = event(&mut events, "event");
    cached.final_groups = Some(2);
    cached.classify();
    assert!(cached.labels.is_empty());
    cached.final_groups = Some(1);
    cached.classify();
    drop(events);

    let count = calls.clone();
    assert!(
        cache
            .load("other", "w1", || async move {
                count.fetch_add(1, Ordering::SeqCst);
                None
            })
            .await
            .is_none()
    );
    assert!(
        cache
            .load("other", "w1", || async {
                panic!("retry must be backed off")
            })
            .await
            .is_none()
    );
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let values = fixture();
    cache
        .observe_phases(
            "browsed",
            &[&json!({"phaseOrder":2,"phaseGroups":{"pageInfo":{"total":1}}})],
        )
        .await;
    cache
        .observe_sets(
            "browsed",
            &values[..10].iter().collect::<Vec<_>>(),
            true,
            &json!({"page":1,"perPage":10,"totalPages":2}),
        )
        .await;
    {
        let mut events = cache.events.lock().await;
        assert!(!event(&mut events, "browsed").complete);
    }
    cache
        .observe_sets(
            "browsed",
            &values[10..].iter().collect::<Vec<_>>(),
            true,
            &json!({"page":2,"perPage":10,"totalPages":2}),
        )
        .await;
    assert_eq!(
        cache
            .load("browsed", "l4", || async {
                panic!("loaded structure must be reused")
            })
            .await,
        Some(Side::Losers)
    );
    {
        let mut events = cache.events.lock().await;
        event(&mut events, "event").refreshed = Some(Instant::now() - CACHE_AGE);
    }
    assert!(cache.load("event", "w1", || async { None }).await.is_none());
}

#[test]
fn phase_and_round_can_be_edited_independently_and_survive_reloading() {
    use crate::{database::Database, state::OverlayStore};
    let db = Database::open(std::path::Path::new(":memory:")).unwrap();
    let store = OverlayStore::load(&db).unwrap();
    let mut selected = store.selected_set().unwrap();
    selected.set_id = Some("qualifier".into());
    selected.event_id = Some("event".into());
    selected.phase = Some("Top 32".into());
    selected.round = Some(Side::Winners.label().into());
    let assets = std::path::Path::new("/jabs-no-test-assets");
    store
        .replace_selected_set(&db, assets, assets, selected)
        .unwrap();
    let mut edited = store.selected_set().unwrap();
    edited.phase = Some("Custom phase".into());
    store
        .update_selected_set(&db, assets, assets, edited)
        .unwrap();
    assert_eq!(
        store.selected_set().unwrap().round.as_deref(),
        Some(Side::Winners.label())
    );
    let mut edited = store.selected_set().unwrap();
    edited.round = Some("Custom round".into());
    store
        .update_selected_set(&db, assets, assets, edited)
        .unwrap();
    let restored = OverlayStore::load(&db).unwrap().selected_set().unwrap();
    assert_eq!(restored.phase.as_deref(), Some("Custom phase"));
    assert_eq!(restored.round.as_deref(), Some("Custom round"));
}
