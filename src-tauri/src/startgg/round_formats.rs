use super::{invalid_response, node_list, optional_object, request, required_text, startgg_best_of, validate_page, ApiError};
use crate::{local_server::{secure_json, startgg_error}, runtime::RuntimeState, startgg_queries};
use axum::{extract::{Query, State}, response::Response, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::BTreeSet, sync::Arc};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RoundFormatsQuery {
    event_id: String,
    page: u32,
}

pub(crate) async fn get(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<RoundFormatsQuery>,
) -> Response {
    match load(&runtime, &query.event_id, query.page).await {
        Ok(formats) => secure_json(Json(formats)),
        Err(error) => startgg_error(error),
    }
}

async fn load(runtime: &RuntimeState, event_id: &str, page: u32) -> Result<Value, ApiError> {
    required_text(event_id, "Select an event first.")?;
    validate_page(page, 100)?;
    let data: Value = request(runtime, startgg_queries::EVENT_ROUND_FORMATS, json!({
        "eventId": event_id, "page": page
    })).await?;
    map_round_formats(&data)
}

fn map_round_formats(data: &Value) -> Result<Value, ApiError> {
    let connection = optional_object(data.pointer("/event/sets"))
        .ok_or_else(|| invalid_response("start.gg did not provide the event's bracket."))?;
    let formats: BTreeSet<_> = node_list(connection.get("nodes"), "set formats")?
        .into_iter()
        .filter_map(Value::as_object)
        .filter_map(startgg_best_of)
        .collect();
    let total_pages = connection.get("pageInfo")
        .and_then(|info| info.get("totalPages"))
        .and_then(Value::as_u64)
        .ok_or_else(|| invalid_response("start.gg did not provide pagination for set formats."))?;
    Ok(json!({ "formats": formats, "totalPages": total_pages }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_distinct_best_of_formats_in_an_event_page() {
        let response = json!({"event": {"sets": {"pageInfo": {"totalPages": 2}, "nodes": [
            {"bestOf": 19, "setGamesType": 1},
            {"bestOf": 7, "setGamesType": 1},
            {"bestOf": 19, "setGamesType": 1},
            {"bestOf": 5, "setGamesType": 2},
            {"bestOf": 4, "setGamesType": 1},
            null
        ]}}});
        assert_eq!(map_round_formats(&response).unwrap(), json!({"formats": [7, 19], "totalPages": 2}));
    }
}
