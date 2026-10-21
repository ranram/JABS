use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// Imported values stay separate so refreshing start.gg cannot replace an operator's choices.
#[derive(Clone, Default, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub name: String,
    pub prefix: Option<String>,
    pub x_handle: Option<String>,
    pub pronouns: Option<String>,
    pub country: Option<String>,
    pub state: Option<String>,
    pub profile_slug: Option<String>,
}
#[derive(Clone, Default, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GamePreferences {
    pub game_key: String,
    pub characters: Vec<String>,
    pub character_asset_id: Option<String>,
    pub portrait_asset_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryPlayer {
    pub local_id: String,
    pub player_id: Option<String>,
    pub imported: Profile,
    /// Missing means inherit; an empty string deliberately hides the imported value.
    pub overrides: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scoreboard_photo: Option<crate::scoreboard_photos::Photo>,
    pub aliases: Vec<String>,
    pub games: Vec<GamePreferences>,
    pub updated_at: String,
    pub seen_at: String,
}
#[derive(Debug, Serialize)]
pub struct LibrarySaveWarning {
    pub field: String,
    pub reason: &'static str,
}
#[derive(Debug, Serialize)]
pub struct LibrarySaveResult {
    pub player: LibraryPlayer,
    pub warnings: Vec<LibrarySaveWarning>,
}
impl LibraryPlayer {
    pub fn text(&self, field: &str, imported: Option<&str>) -> Option<String> {
        self.overrides
            .get(field)
            .map(String::as_str)
            .or(imported)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    }
}
fn bounded_text(value: &str) -> String {
    let mut units = 0;
    value
        .trim()
        .chars()
        .filter(|c| !c.is_control())
        .take_while(|c| {
            units += c.len_utf16();
            units <= 100
        })
        .collect()
}
pub fn clean_text(value: &str) -> String {
    moderated_text(value).0
}

fn moderated_text(value: &str) -> (String, bool) {
    match crate::moderation::censor(Some(bounded_text(value))) {
        Some(value) if value == "[blocked]" => (String::new(), true),
        value => (value.unwrap_or_default(), false),
    }
}

fn clean_saved_text(value: &str, field: &str, blocked: &mut BTreeSet<String>) -> String {
    let (value, was_blocked) = moderated_text(value);
    if was_blocked {
        blocked.insert(field.into());
    }
    value
}

pub fn clean_profile(profile: &mut Profile) {
    profile.name = clean_text(&profile.name);
    for value in [
        &mut profile.prefix,
        &mut profile.x_handle,
        &mut profile.pronouns,
        &mut profile.country,
        &mut profile.state,
    ] {
        *value = value
            .take()
            .map(|s| clean_text(&s))
            .filter(|s| !s.is_empty());
    }
    profile.profile_slug = profile.profile_slug.take().filter(|slug| {
        slug.starts_with("user/")
            && slug.len() < 150
            && slug
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_/".contains(c))
    });
}
pub fn validate(
    player: &mut LibraryPlayer,
    previous: Option<&LibraryPlayer>,
) -> Result<Vec<LibrarySaveWarning>, String> {
    let mut blocked = BTreeSet::new();
    if !valid_local_id(&player.local_id)
        || player
            .player_id
            .as_deref()
            .is_some_and(|id| !valid_startgg_id(id))
    {
        return Err("Invalid player identity.".into());
    }
    clean_profile(&mut player.imported);
    if let Some(photo) = &player.scoreboard_photo { photo.validate()?; }
    if player.overrides.len() > 10 || player.aliases.len() > 30 || player.games.len() > 100 {
        return Err("This player record has too many saved details.".into());
    }
    for (key, value) in &mut player.overrides {
        if ![
            "name",
            "prefix",
            "xHandle",
            "pronouns",
            "country",
            "state",
            "displayFlag",
            "playerPhotoAssetId",
            "age",
            "nickname",
        ]
        .contains(&key.as_str())
            || value.len() > 1000
        {
            return Err("Invalid player field.".into());
        }
        if key == "age" && !value.trim().is_empty() {
            let age = value
                .trim()
                .parse::<u8>()
                .ok()
                .filter(|age| (1..=120).contains(age))
                .ok_or("Enter a whole-number age from 1 to 120.")?;
            *value = age.to_string();
        } else {
            *value = clean_saved_text(value, key, &mut blocked);
        }
    }
    // Rejected edits must preserve both saved overrides and inherited values.
    for field in &blocked {
        if let Some(value) = previous.and_then(|record| record.overrides.get(field)) {
            player.overrides.insert(field.clone(), value.clone());
        } else {
            player.overrides.remove(field);
        }
    }
    if player.text("name", Some(&player.imported.name)).is_none() {
        if blocked.contains("name") {
            return Err("players.blockedTag".into());
        } else {
            return Err("Enter a player tag.".into());
        }
    }
    let photo = player.overrides.get("playerPhotoAssetId");
    if photo.is_some_and(|s| s.contains(['/', '\\']) || s == "..") {
        return Err("Choose a local player photo filename.".into());
    }
    let mut location: crate::state::Player = serde_json::from_value(serde_json::json!({
        "entrantId": "library", "name": "library", "score": 0,
        "country": player.text("country", player.imported.country.as_deref()),
        "state": player.text("state", player.imported.state.as_deref()),
        "displayFlag": player.text("displayFlag", None)
    }))
    .map_err(|_| "Invalid player location.".to_owned())?;
    crate::catalogs::validate_player_location(&mut location)?;
    player.aliases = player
        .aliases
        .iter()
        .map(|s| clean_saved_text(s, "aliases", &mut blocked))
        .filter(|s| !s.is_empty())
        .collect();
    if blocked.contains("aliases") {
        player.aliases = previous
            .map(|record| record.aliases.clone())
            .unwrap_or_default();
    }
    player.aliases.sort();
    player.aliases.dedup();
    let mut keys = std::collections::HashSet::new();
    for game in &mut player.games {
        if game.game_key.is_empty()
            || game.game_key.len() > 150
            || !game
                .game_key
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
            || !keys.insert(game.game_key.clone())
            || game.characters.len() > crate::state::max_characters_for_game(&game.game_key)
        {
            return Err("Invalid saved game preferences.".into());
        }
        let mut blocked_characters = false;
        game.characters = game
            .characters
            .iter()
            .filter_map(|s| {
                let value = crate::moderation::censor_character(Some(bounded_text(s)));
                if value.as_deref() == Some("[blocked]") {
                    blocked.insert("characters".into());
                    blocked_characters = true;
                }
                value
            })
            .filter(|s| !s.is_empty() && s != "[blocked]")
            .collect();
        if blocked_characters {
            if let Some(saved) = previous.and_then(|record| {
                record.games.iter().find(|saved| saved.game_key == game.game_key)
            }) {
                *game = saved.clone();
            } else {
                game.characters.clear();
                game.character_asset_id = None;
                game.portrait_asset_id = None;
            }
        }
        for asset in [&game.character_asset_id, &game.portrait_asset_id] {
            if asset
                .as_ref()
                .is_some_and(|s| s.len() > 300 || s.contains(['/', '\\']) || s == "..")
            {
                return Err("Invalid artwork reference.".into());
            }
        }
    }
    Ok(blocked
        .into_iter()
        .map(|field| LibrarySaveWarning {
            field,
            reason: "blocked-text",
        })
        .collect())
}
pub fn valid_local_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|c| c.is_ascii_hexdigit())
}
pub fn valid_startgg_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 30 && id.bytes().all(|c| c.is_ascii_digit())
}
