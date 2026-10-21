use crate::{runtime::RuntimeState, startgg::ApiError};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;

const CACHE_KEY: &str = "fgc-v1";

#[derive(Deserialize)]
struct CatalogCorrections {
    include: BTreeMap<String, String>,
    exclude: BTreeMap<String, String>,
    supplement: BTreeMap<String, String>,
}

/// Loads the fighting game list, falling back to the saved copy when offline.
pub async fn list(runtime: &RuntimeState) -> Result<Value, ApiError> {
    let saved = runtime
        .database
        .startgg_cache(CACHE_KEY)
        .ok()
        .flatten()
        .and_then(|(payload, fresh)| {
            serde_json::from_str::<Value>(&payload)
                .ok()
                .filter(|value| value.get("games").is_some_and(Value::is_array))
                .map(|value| (value, fresh))
        });
    if let Some((value, true)) = &saved {
        return Ok(value.clone());
    }
    match fetch(runtime).await {
        Ok(result) => {
            let _ = runtime
                .database
                .save_startgg_cache(CACHE_KEY, &result.to_string());
            Ok(result)
        }
        Err(error) => match saved {
            Some((mut value, _)) => {
                value["cached"] = json!(true);
                Ok(value)
            }
            None => Err(error),
        },
    }
}

async fn fetch(runtime: &RuntimeState) -> Result<Value, ApiError> {
    let registry: Value = runtime.startgg.videogame_registry().await?;
    parse_registry(&registry)
}

fn parse_registry(data: &Value) -> Result<Value, ApiError> {
    let invalid = || ApiError {
        error: "Could not read the game list returned by start.gg.".to_owned(),
        code: "invalid-response",
    };
    let nodes = data
        .pointer("/entities/videogame")
        .and_then(Value::as_array)
        .filter(|nodes| !nodes.is_empty())
        .ok_or_else(invalid)?;
    let corrections: CatalogCorrections = serde_json::from_str(include_str!(
        "../resources/fgc_overrides.json"
    ))
    .expect("compiled game catalog corrections must be valid");
    let mut games = BTreeMap::new();
    for node in nodes {
        let id = match node.get("id") {
            Some(Value::String(id)) if !id.trim().is_empty() => id.trim().to_owned(),
            Some(Value::Number(id)) => id.to_string(),
            _ => return Err(invalid()),
        };
        let name = match node.get("name") {
            Some(Value::String(name)) => name.trim(),
            _ => return Err(invalid()),
        };
        let genre = match node.get("primaryGenre") {
            Some(Value::String(genre)) => Some(genre.as_str()),
            None | Some(Value::Null) => None,
            _ => return Err(invalid()),
        };
        // Platform fighters count too. Corrections use IDs because similar
        // names can belong to unrelated games in the same franchise.
        let included = genre == Some("fighting")
            || corrections.include.contains_key(&id)
            || corrections.supplement.contains_key(&id);
        if included && !corrections.exclude.contains_key(&id) {
            games.insert(id.clone(), json!({ "id": id, "name": name }));
        }
    }
    // The registry omits some games listed in start.gg's GraphQL catalog.
    // Add the reviewed entries, keeping start.gg's name if the registry has one.
    for (id, name) in &corrections.supplement {
        // Exclusions also apply to games supplied by the corrections file.
        if corrections.exclude.contains_key(id) {
            continue;
        }
        games
            .entry(id.clone())
            .or_insert_with(|| json!({ "id": id, "name": name }));
    }
    if games.is_empty() {
        return Err(invalid());
    }
    Ok(json!({ "games": games.into_values().collect::<Vec<_>>(), "cached": false }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registry_corrects_genres_and_supplements_missing_fighters_without_duplicates() {
        let data = json!({ "entities": { "videogame": [
            { "id": 49783, "name": " TEKKEN 8 ", "primaryGenre": "fighting" },
            { "id": "53945", "name": "Rivals of Aether II", "primaryGenre": "fighting" },
            { "id": 48599, "name": "Mortal Kombat 1", "primaryGenre": null },
            { "id": 48548, "name": "Granblue Fantasy Versus: Rising", "primaryGenre": null },
            { "id": 64423, "name": "2XKO (registry name)", "primaryGenre": null },
            { "id": 14, "name": "Rocket League", "primaryGenre": "sport" },
            { "id": 38949, "name": "Pokémon Unite", "primaryGenre": "fighting" },
            { "id": 11551, "name": "Pokémon GO", "primaryGenre": "fighting" },
            { "id": 28893, "name": "Granblue Fantasy: Relink", "primaryGenre": null }
        ] } });
        let result = parse_registry(&data).unwrap();
        let games = result["games"].as_array().unwrap();
        let ids: std::collections::BTreeSet<_> = games
            .iter()
            .map(|game| game["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids.len(), games.len(), "Each game appears only once.");
        for excluded in ["14", "38949", "11551", "28893"] {
            assert!(!ids.contains(excluded), "Excluded game {excluded} appeared.");
        }
        assert!(games.contains(&json!({ "id": "49783", "name": "TEKKEN 8" })));
        assert!(games.contains(&json!({ "id": "53945", "name": "Rivals of Aether II" })));
        assert!(games.contains(&json!({ "id": "48599", "name": "Mortal Kombat 1" })));
        assert!(
            games.contains(&json!({ "id": "48548", "name": "Granblue Fantasy Versus: Rising" }))
        );
        assert!(
            games.contains(&json!({ "id": "73221", "name": "Fatal Fury: City of the Wolves" }))
        );
        assert!(games.contains(&json!({ "id": "64423", "name": "2XKO (registry name)" })));
        assert!(
            games.contains(&json!({ "id": "114292", "name": "Avatar Legends: The Fighting Game" }))
        );
        assert!(games.contains(&json!({ "id": "107706", "name": "Marvel Tokon: Fighting Souls" })));
        for data in [
            json!({}),
            json!({ "entities": { "videogame": [] } }),
            json!({ "entities": { "videogame": [{ "id": null }] } }),
        ] {
            assert!(parse_registry(&data).is_err());
        }
    }
}
