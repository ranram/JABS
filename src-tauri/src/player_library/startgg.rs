use super::{LibraryPlayer, Profile};
use crate::{
    database::Database,
    runtime::RuntimeState,
    startgg::{request, ApiError},
    state::SelectedSet,
};
use serde_json::{json, Value};

const EVENT_PLAYERS: &str = r#"
query LibraryEventPlayers($eventId: ID!, $page: Int!) {
 event(id: $eventId) {
  entrants(query: {page: $page, perPage: 50}) {
   pageInfo { totalPages total }
   nodes { participants {
    gamerTag prefix player { id }
    connectedAccounts
    user { slug genderPronoun location { country state } authorizations(types: [TWITTER]) { externalUsername } }
   } }
  }
 }
}"#;
fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_u64().map(|n| n.to_string()))
}
pub fn participant(value: &Value) -> Option<(String, Profile)> {
    let id = text(&value["player"]["id"])?;
    // History queries may include only a player ID, not an importable profile.
    let name = text(&value["gamerTag"]).filter(|name| !name.trim().is_empty())?;
    let user = &value["user"];
    let (country, state) = crate::catalogs::normalize_imported_location(
        user["location"]["country"].as_str(),
        user["location"]["state"].as_str(),
    );
    Some((
        id,
        Profile {
            name,
            prefix: text(&value["prefix"]),
            x_handle: crate::startgg::x_handle_from_participant(value.as_object()),
            pronouns: text(&user["genderPronoun"]),
            country,
            state,
            profile_slug: text(&user["slug"]),
        },
    ))
}
/// Read profiles only from known participant fields. Do not save raw responses or connected-account data.
pub fn observe(database: &Database, data: &Value) -> Result<usize, String> {
    fn collect(value: &Value, players: &mut Vec<(String, Profile)>) {
        match value {
            Value::Object(object) => {
                if let Some(participants) = object.get("participants").and_then(Value::as_array) {
                    players.extend(participants.iter().filter_map(participant));
                }
                for (key, child) in object {
                    if key != "participants" {
                        collect(child, players);
                    }
                }
            }
            Value::Array(items) => {
                for item in items {
                    collect(item, players);
                }
            }
            _ => {}
        }
    }
    let mut players = Vec::new();
    collect(data, &mut players);
    database.observe_players(players)
}
pub async fn import_page(
    runtime: &std::sync::Arc<RuntimeState>,
    event_id: &str,
    page: u32,
) -> Result<Value, ApiError> {
    if !super::valid_startgg_id(event_id) || page == 0 || page > 10_000 {
        return Err(jabs_startgg_client::api_error(
            "Choose an event and a valid page.",
            "invalid-response",
        ));
    }
    let data: Value = request(
        runtime,
        EVENT_PLAYERS,
        json!({ "eventId": event_id, "page": page }),
    )
    .await?;
    let info = &data["event"]["entrants"]["pageInfo"];
    let Some(total_pages) = info["totalPages"].as_u64() else {
        return Err(jabs_startgg_client::api_error(
            "start.gg did not return the event's players.",
            "invalid-response",
        ));
    };
    let writer = runtime.clone();
    let added = tokio::task::spawn_blocking(move || observe(&writer.database, &data))
        .await
        .map_err(|_| {
            jabs_startgg_client::api_error("The player import could not finish.", "upstream")
        })?
        .map_err(|s| jabs_startgg_client::api_error(&s, "upstream"))?;
    Ok(json!({ "page": page, "totalPages": total_pages, "added": added }))
}
pub fn presentation(player: &LibraryPlayer, game_key: &str) -> Value {
    let profile = &player.imported;
    let mut value = json!({
        "localPlayerId": player.local_id, "playerId": player.player_id,
        "overriddenFields": player.overrides.keys().collect::<Vec<_>>(),
        "name": player.text("name", Some(&profile.name)),
        "prefix": player.text("prefix", profile.prefix.as_deref()),
        "sponsor": player.text("prefix", profile.prefix.as_deref()),
        "xHandle": player.text("xHandle", profile.x_handle.as_deref()),
        "pronouns": player.text("pronouns", profile.pronouns.as_deref()),
        "country": player.text("country", profile.country.as_deref()),
        "state": player.text("state", profile.state.as_deref()),
        "displayFlag": player.text("displayFlag", None),
        "playerPhotoAssetId": player.text("playerPhotoAssetId", None),
        "age": player.text("age", None).and_then(|age| age.parse::<u8>().ok()),
        "nickname": player.text("nickname", None),
    });
    if let Some(game) = player.games.iter().find(|game| game.game_key == game_key) {
        value["characters"] = json!(game.characters);
        value["character"] = json!(game.characters.first());
        value["characterAssetId"] = json!(game.character_asset_id);
        value["portraitAssetId"] = json!(game.portrait_asset_id);
    }
    value
}
pub fn fill_defaults(database: &Database, set: &mut SelectedSet) -> Result<(), String> {
    let game_key = set.asset_catalog_slug.as_deref().unwrap_or(&set.game_id);
    for player in [&mut set.player_one, &mut set.player_two] {
        // Drop stale library links without removing the player already on stream.
        if let Some(id) = player.local_player_id.as_deref() {
            if database.library_player(id)?.is_none() {
                player.local_player_id = None;
            }
        }
        let Some(record) = database.library_resolve(
            player.local_player_id.as_deref(),
            player.player_id.as_deref(),
        )?
        else {
            continue;
        };
        player.local_player_id = Some(record.local_id.clone());
        // Keep the name and prefix from this tournament; apply library preferences only to reusable fields.
        player.x_handle = record.text(
            "xHandle",
            player
                .x_handle
                .as_deref()
                .or(record.imported.x_handle.as_deref()),
        );
        player.pronouns = record.text(
            "pronouns",
            player
                .pronouns
                .as_deref()
                .or(record.imported.pronouns.as_deref()),
        );
        player.country = record.text(
            "country",
            player
                .country
                .as_deref()
                .or(record.imported.country.as_deref()),
        );
        player.state = record.text(
            "state",
            player.state.as_deref().or(record.imported.state.as_deref()),
        );
        player.display_flag = record.text("displayFlag", None);
        player.player_photo_asset_id = record.text("playerPhotoAssetId", None);
        if let Some(game) = record.games.iter().find(|game| game.game_key == game_key) {
            player.characters = game.characters.clone();
            player.character = game.characters.first().cloned();
            player.character_asset_id = game.character_asset_id.clone();
            player.portrait_asset_id = game.portrait_asset_id.clone();
        }
    }
    Ok(())
}
