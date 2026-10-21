use crate::local_server::secure_json;
use crate::{
    catalogs,
    runtime::RuntimeState,
    startgg::{self, ApiError},
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::BTreeSet, sync::Arc};

const CHARACTER_QUERY: &str = r#"
query GameCharacterRoster($videogameId: ID!) {
  videogame(id: $videogameId) { characters { id name } }
}
"#;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareGameCharactersInput {
    #[serde(rename = "gameId")]
    asset_catalog_slug: String,
    #[serde(rename = "videogameId")]
    startgg_videogame_id: Option<String>,
}

pub async fn prepare(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(input): Json<PrepareGameCharactersInput>,
) -> Response {
    if let Some(response) = crate::local_server::reject_untrusted_mutation(&headers) {
        return response;
    }
    if !catalogs::valid_game_asset_catalog_slug(&input.asset_catalog_slug)
        || input.startgg_videogame_id.as_ref().is_some_and(|id| {
            id.is_empty() || id.len() > 20 || !id.bytes().all(|byte| byte.is_ascii_digit())
        })
    {
        return secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": "Choose a valid game before preparing character files." })),
        ));
    }
    // Create the folders first so users can add artwork even if the roster request fails.
    let root = runtime.game_asset_directory.clone();
    let asset_catalog_slug = input.asset_catalog_slug.clone();
    let folders = tokio::task::spawn_blocking(move || {
        catalogs::prepare_character_files(&root, &asset_catalog_slug, &[])
    })
    .await;
    if !matches!(folders, Ok(Ok(_))) {
        return file_error();
    }
    let characters = if let Some(characters) = catalogs::built_in_roster(&input.asset_catalog_slug)
    {
        characters
    } else if let Some(id) = &input.startgg_videogame_id {
        match load_cached_roster(&runtime, id).await {
            Ok(characters) => characters,
            Err(error) => return secure_json((StatusCode::BAD_GATEWAY, Json(error))),
        }
    } else {
        catalogs::local_character_roster(&runtime.game_asset_directory, &input.asset_catalog_slug)
            .unwrap_or_default()
    };
    let available = !characters.is_empty();
    let root = runtime.game_asset_directory.clone();
    let result = tokio::task::spawn_blocking(move || {
        catalogs::prepare_character_files(&root, &input.asset_catalog_slug, &characters)
    })
    .await;
    match result {
        Ok(Ok(created)) => secure_json(Json(
            json!({ "created": created, "rosterAvailable": available }),
        )),
        _ => file_error(),
    }
}

fn file_error() -> Response {
    secure_json((
        StatusCode::UNPROCESSABLE_ENTITY,
        Json(
            json!({ "error": "Could not create the character files. Check that JABS can write to the game's artwork folders." }),
        ),
    ))
}

async fn load_cached_roster(
    runtime: &RuntimeState,
    videogame_id: &str,
) -> Result<Vec<String>, ApiError> {
    let key = format!("characters-v1:{videogame_id}");
    // Reuse saved rosters until the user clears the start.gg cache.
    // Selecting the game afterward fetches its character names again.
    if let Some(characters) = runtime
        .database
        .startgg_cache(&key)
        .ok()
        .flatten()
        .and_then(|(payload, _)| serde_json::from_str::<Vec<String>>(&payload).ok())
    {
        return Ok(characters);
    }
    let data: Value = startgg::request(
        runtime,
        CHARACTER_QUERY,
        json!({ "videogameId": videogame_id }),
    )
    .await?;
    let characters = parse_roster(&data)?;
    let _ = runtime
        .database
        .save_startgg_cache(&key, &json!(characters).to_string());
    Ok(characters)
}

fn parse_roster(data: &Value) -> Result<Vec<String>, ApiError> {
    let invalid = || ApiError {
        error: "Could not read the character list returned by start.gg.".to_owned(),
        code: "invalid-response",
    };
    let game = data
        .get("videogame")
        .filter(|game| game.is_object())
        .ok_or_else(invalid)?;
    let Some(value) = game.get("characters").filter(|value| !value.is_null()) else {
        return Ok(Vec::new());
    };
    let nodes = value
        .as_array()
        .filter(|nodes| nodes.len() <= 512)
        .ok_or_else(invalid)?;
    let mut characters = BTreeSet::new();
    for node in nodes {
        let name = node
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|name| !name.is_empty() && name.len() <= 180)
            .ok_or_else(invalid)?;
        characters.insert(name.to_owned());
    }
    Ok(characters.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn character_rosters_accept_missing_data_but_reject_malformed_entries() {
        assert_eq!(
            parse_roster(&json!({ "videogame": { "characters": [
            { "id": 1134, "name": "Android 18" }, { "id": 1134, "name": " Android 18 " },
            { "id": 859, "name": "Goku (Super Saiyan)" }
        ] } }))
            .unwrap(),
            ["Android 18", "Goku (Super Saiyan)"]
        );
        for characters in [json!(null), json!([])] {
            assert!(
                parse_roster(&json!({ "videogame": { "characters": characters } }))
                    .unwrap()
                    .is_empty()
            );
        }
        for data in [
            json!({}),
            json!({ "videogame": null }),
            json!({ "videogame": { "characters": {} } }),
            json!({ "videogame": { "characters": [{ "name": " " }] } }),
        ] {
            assert!(parse_roster(&data).is_err());
        }
    }
}
