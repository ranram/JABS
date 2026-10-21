use super::{startgg::participant, valid_startgg_id, LibraryPlayer};
use crate::{
    database::Database,
    runtime::RuntimeState,
    startgg::{request, ApiError},
};
use jabs_startgg_client::api_error;
use serde::Serialize;
use serde_json::{json, Value};
use std::future::Future;

const BY_PLAYER_ID: &str = r#"
query LibraryPlayerById($playerId: ID!) {
 player(id: $playerId) {
  id gamerTag prefix
  user { slug genderPronoun location { country state } authorizations(types: [TWITTER]) { externalUsername } }
 }
}"#;
const BY_PROFILE_SLUG: &str = r#"
query LibraryPlayerBySlug($slug: String!) {
 user(slug: $slug) {
  slug genderPronoun location { country state } authorizations(types: [TWITTER]) { externalUsername }
  player { id gamerTag prefix }
 }
}"#;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum Reference {
    PlayerId(String),
    ProfileSlug(String),
}
impl Reference {
    pub(super) fn parse(input: &str) -> Result<Self, ApiError> {
        let input = input.trim();
        let invalid = || {
            api_error(
                "Enter a start.gg profile URL, profile code, or numeric player ID.",
                "player-reference",
            )
        };
        if input.is_empty() || input.len() > 1024 || input.contains('\\') {
            return Err(invalid());
        }
        if valid_startgg_id(input) {
            let id = input.trim_start_matches('0');
            return if id.is_empty() {
                Err(invalid())
            } else {
                Ok(Self::PlayerId(id.into()))
            };
        }
        let lower = input.to_ascii_lowercase();
        let is_url = input.contains("://")
            || lower.starts_with("start.gg/")
            || lower.starts_with("www.start.gg/");
        let path = if is_url {
            let url_text = if input.contains("://") {
                input.to_owned()
            } else {
                format!("https://{input}")
            };
            let url = tauri::Url::parse(&url_text).map_err(|_| invalid())?;
            if !matches!(url.scheme(), "http" | "https")
                || !matches!(url.host_str(), Some("start.gg" | "www.start.gg"))
                || !url.username().is_empty()
                || url.password().is_some()
                || url.port().is_some()
            {
                return Err(invalid());
            }
            url.path().to_owned()
        } else {
            input.to_owned()
        };
        let segments: Vec<_> = path.trim_matches('/').split('/').collect();
        let code = match segments.as_slice() {
            [section, code, ..] if section.eq_ignore_ascii_case("user") && segments.len() <= 3 => {
                *code
            }
            [code] if !is_url => *code,
            _ => return Err(invalid()),
        };
        if code.is_empty()
            || code.len() > 100
            || !code
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err(invalid());
        }
        // Profile codes are separate from numeric Player IDs; a URL keeps even an all-digit code unambiguous.
        let code = if code.bytes().all(|c| c.is_ascii_hexdigit()) {
            code.to_ascii_lowercase()
        } else {
            code.to_owned()
        };
        Ok(Self::ProfileSlug(format!("user/{code}")))
    }
}
#[derive(Serialize)]
pub struct LookupResult {
    pub player: LibraryPlayer,
    pub source: &'static str,
}

pub async fn find(runtime: &RuntimeState, reference: &str) -> Result<LookupResult, ApiError> {
    find_with(&runtime.database, reference, |reference| async move {
        let (query, variables) = match reference {
            Reference::PlayerId(id) => (BY_PLAYER_ID, json!({ "playerId": id })),
            Reference::ProfileSlug(slug) => (BY_PROFILE_SLUG, json!({ "slug": slug })),
        };
        request(runtime, query, variables).await
    })
    .await
}
/// Reuse complete saved profiles; refresh placeholder names while preserving local preferences.
pub(super) async fn find_with<F, Fut>(
    database: &Database,
    input: &str,
    fetch: F,
) -> Result<LookupResult, ApiError>
where
    F: FnOnce(Reference) -> Fut,
    Fut: Future<Output = Result<Value, ApiError>>,
{
    let reference = Reference::parse(input)?;
    let cached = match &reference {
        Reference::PlayerId(id) => database.library_resolve(None, Some(id)),
        Reference::ProfileSlug(slug) => database.library_profile_slug(slug),
    }
    .map_err(|error| api_error(&error, "upstream"))?;
    if let Some(player) = &cached {
        let fallback_name = format!("Player #{}", player.player_id.as_deref().unwrap_or_default());
        if player.imported.name != fallback_name {
            return Ok(LookupResult {
                player: player.clone(),
                source: "local",
            });
        }
    }
    // Retry incomplete imports without making ordinary library lookups depend on the network.
    let data = match fetch(reference.clone()).await {
        Ok(data) => data,
        Err(error) => {
            return match cached {
                Some(player) => Ok(LookupResult { player, source: "local" }),
                None => Err(error),
            };
        }
    };
    let (player, user) = match &reference {
        Reference::PlayerId(_) => (&data["player"], &data["player"]["user"]),
        Reference::ProfileSlug(_) => (&data["user"]["player"], &data["user"]),
    };
    if !player.is_object() {
        return Err(api_error(
            "No player profile was found for that link or ID.",
            "player-not-found",
        ));
    }
    let participant_data = json!({ "player": { "id": player["id"] }, "gamerTag": player["gamerTag"], "prefix": player["prefix"], "user": user });
    let (id, profile) = participant(&participant_data)
        .filter(|(id, profile)| valid_startgg_id(id) && !profile.name.trim().is_empty())
        .ok_or_else(|| {
            api_error(
                "start.gg returned an incomplete player profile.",
                "invalid-response",
            )
        })?;
    let matches = match &reference {
        Reference::PlayerId(expected) => expected == &id,
        Reference::ProfileSlug(expected) => profile.profile_slug.as_deref() == Some(expected),
    };
    if !matches {
        return Err(api_error(
            "start.gg returned a different player profile.",
            "invalid-response",
        ));
    }
    database
        .observe_players(vec![(id.clone(), profile)])
        .map_err(|error| api_error(&error, "upstream"))?;
    let player = database
        .library_resolve(None, Some(&id))
        .map_err(|error| api_error(&error, "upstream"))?
        .ok_or_else(|| api_error("The player profile could not be saved.", "upstream"))?;
    Ok(LookupResult {
        player,
        source: "startgg",
    })
}
