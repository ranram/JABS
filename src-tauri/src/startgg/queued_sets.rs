use super::*;

pub(crate) async fn queued_sets(
    runtime: &RuntimeState,
    event_id: &str,
    ids: &[String],
) -> Result<Vec<Value>, ApiError> {
    if ids.is_empty() || ids.len() > 20 {
        return Err(invalid_response("Invalid match queue entry."));
    }
    let mut variables = Map::new();
    let mut declarations = Vec::new();
    let mut fields = Vec::new();
    for (index, id) in ids.iter().enumerate() {
        declarations.push(format!("$id{index}: ID!"));
        variables.insert(format!("id{index}"), json!(id));
        fields.push(format!(
            r#"s{index}: set(id: $id{index}) {{
            id state winnerId event {{ id }}
            slots {{ entrant {{ id name participants {{ id gamerTag prefix player {{ id }} }} }}
                standing {{ stats {{ score {{ value }} }} }} }}
        }}"#
        ));
    }
    let query = format!(
        "query QueuedSets({}) {{ {} }}",
        declarations.join(","),
        fields.join("\n")
    );
    let data: Value = request(runtime, &query, Value::Object(variables)).await?;
    let mut summaries = Vec::new();
    for index in 0..ids.len() {
        let node = &data[format!("s{index}")];
        if node
            .get("event")
            .and_then(|event| event.get("id"))
            .and_then(normalized_id)
            .as_deref()
            != Some(event_id)
        {
            continue;
        }
        if let Some(summary) = set_summary(node)? {
            summaries.push(summary);
        }
    }
    Ok(summaries)
}
