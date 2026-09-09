use crate::state::Player;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
};
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

mod character_assets;
pub use character_assets::{
    canonical_character_for_catalog, character_names_match, has_game_character_asset,
    is_character_for_game, list_game_character_assets, resolve_game_character_asset,
    resolve_game_character_portrait, valid_game_asset_catalog_slug,
};
use character_assets::{character_asset_directory, character_portrait_directory};

const LOCATION_JSON: &str = include_str!("../resources/location_catalog.json");
const PRIDE_FLAGS_JSON: &str = include_str!("../../src/shared/prideFlags.json");
const MAX_CATALOG_RASTER_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Deserialize)]
struct LocationCountry {
    code: String,
    name: String,
    emoji: String,
    states: Vec<LocationState>,
}

#[derive(Deserialize)]
struct PrideFlagDefinition {
    id: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct LocationState {
    code: String,
    name: String,
}

#[derive(Serialize)]
pub struct CountryOption<'a> {
    code: &'a str,
    name: &'a str,
    emoji: &'a str,
}

#[derive(Serialize)]
pub struct LogoAsset {
    id: String,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetCatalogCounts {
    character_art: usize,
    character_portraits: usize,
    tournament_logos: usize,
    sponsor_logos: usize,
    player_photos: usize,
}

#[derive(Serialize)]
pub struct AssetCatalogSummary {
    logos: Vec<LogoAsset>,
    counts: AssetCatalogCounts,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMediaMatch {
    sponsor_logo_asset_id: Option<String>,
    player_photo_asset_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayMediaMatches {
    player_one: PlayerMediaMatch,
    player_two: PlayerMediaMatch,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityMediaInput {
    pub name: String,
    pub prefix: Option<String>,
    pub sponsor: Option<String>,
}

fn locations() -> &'static Vec<LocationCountry> {
    static LOCATIONS: OnceLock<Vec<LocationCountry>> = OnceLock::new();
    LOCATIONS.get_or_init(|| {
        serde_json::from_str(LOCATION_JSON).expect("compiled location catalog must be valid")
    })
}

fn pride_flags() -> &'static Vec<PrideFlagDefinition> {
    static PRIDE_FLAGS: OnceLock<Vec<PrideFlagDefinition>> = OnceLock::new();
    PRIDE_FLAGS.get_or_init(|| {
        serde_json::from_str(PRIDE_FLAGS_JSON).expect("compiled Pride flag catalog must be valid")
    })
}

pub fn country_options() -> Vec<CountryOption<'static>> {
    locations().iter().map(|country| CountryOption {
        code: &country.code,
        name: &country.name,
        emoji: &country.emoji,
    }).collect()
}

pub fn state_options(country_code: &str) -> Option<Vec<LocationState>> {
    let code = country_code.trim().to_uppercase();
    locations().iter()
        .find(|country| country.code == code)
        .map(|country| country.states.clone())
}

pub fn normalize_imported_location(
    country_value: Option<&str>,
    state_value: Option<&str>,
) -> (Option<String>, Option<String>) {
    let Some(country_value) = country_value else { return (None, None) };
    let country_needle = normalize_label(country_value);
    let Some(country) = locations().iter().find(|country| {
        normalize_label(&country.code) == country_needle
            || normalize_label(&country.name) == country_needle
    }) else { return (None, None) };
    let state = state_value.and_then(|state_value| {
        let state_needle = normalize_label(state_value);
        country.states.iter().find(|state| {
            normalize_label(&state.code) == state_needle
                || normalize_label(&state.name) == state_needle
        }).map(|state| state.code.clone())
    });
    (Some(country.code.clone()), state)
}

pub fn validate_player_location(player: &mut Player) -> Result<(), String> {
    if let Some(display_flag) = player.display_flag.as_deref() {
        let normalized = display_flag.trim().to_lowercase();
        if normalized.is_empty() {
            player.display_flag = None;
        } else if pride_flags().iter().any(|flag| flag.id == normalized) {
            player.display_flag = Some(normalized);
        } else {
            return Err("Choose a valid display flag from the list.".to_owned());
        }
    }
    let Some(country_value) = player.country.as_deref() else {
        if player.state.is_some() {
            return Err("Select a country before selecting a state or province.".to_owned());
        }
        return Ok(());
    };
    let country_code = country_value.trim().to_uppercase();
    let Some(country) = locations().iter().find(|country| country.code == country_code) else {
        return Err("Select a valid country from the list.".to_owned());
    };
    player.country = Some(country_code);
    if let Some(state_value) = player.state.as_deref() {
        let state_code = state_value.trim().to_uppercase();
        if !country.states.iter().any(|state| state.code == state_code) {
            return Err("Select a valid state or province for the chosen country.".to_owned());
        }
        player.state = Some(state_code);
    }
    Ok(())
}

pub fn list_logo_assets(directory: &Path) -> Result<Vec<LogoAsset>, String> {
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("Unable to read the local tournament logo catalog.".to_owned()),
    };
    let mut logos = entries.filter_map(Result::ok).filter_map(|entry| {
        let id = entry.file_name().into_string().ok()?;
        resolve_logo_path(directory, &id).map(|_| LogoAsset {
            label: logo_label(&id),
            id,
        })
    }).collect::<Vec<_>>();
    logos.sort_by(|left, right| left.label.cmp(&right.label));
    Ok(logos)
}

pub fn asset_catalog_summary(
    logo_directory: &Path,
    sponsor_directory: &Path,
    player_photo_directory: &Path,
    game_asset_directory: &Path,
    game_id: &str,
) -> Result<AssetCatalogSummary, String> {
    let logos = list_logo_assets(logo_directory)?;
    let sponsor_logos = catalog_asset_ids_result(sponsor_directory)?.len();
    let player_photos = catalog_asset_ids_result(player_photo_directory)?.len();
    list_game_character_assets(game_asset_directory, game_id)?;
    let counts = AssetCatalogCounts {
        character_art: catalog_asset_ids_result(
            &character_asset_directory(game_asset_directory, game_id),
        )?.len(),
        character_portraits: catalog_asset_ids_result(
            &character_portrait_directory(game_asset_directory, game_id),
        )?.len(),
        tournament_logos: logos.len(),
        sponsor_logos,
        player_photos,
    };
    Ok(AssetCatalogSummary { logos, counts })
}

pub fn resolve_logo_path(directory: &Path, asset_id: &str) -> Option<(PathBuf, &'static str)> {
    resolve_raster_path(directory, asset_id, valid_logo_id)
}

pub fn resolve_media_path(directory: &Path, asset_id: &str) -> Option<(PathBuf, &'static str)> {
    resolve_raster_path(directory, asset_id, valid_media_id)
}

fn resolve_raster_path(
    directory: &Path,
    asset_id: &str,
    valid_id: fn(&str) -> bool,
) -> Option<(PathBuf, &'static str)> {
    if !valid_id(asset_id) {
        return None;
    }
    let mime = match asset_id.rsplit_once('.')?.1.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => return None,
    };
    let path = directory.join(asset_id);
    let metadata = std::fs::symlink_metadata(&path).ok()?;
    (metadata.file_type().is_file()
        && metadata.len() > 0
        && metadata.len() <= MAX_CATALOG_RASTER_BYTES)
        .then_some((path, mime))
}

pub fn valid_raster_bytes(bytes: &[u8], mime: &str) -> bool {
    match mime {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

pub fn has_logo(directory: &Path, asset_id: &str) -> bool {
    list_logo_assets(directory)
        .is_ok_and(|assets| assets.iter().any(|asset| asset.id == asset_id))
}

pub fn match_overlay_media(
    sponsor_directory: &Path,
    player_photo_directory: &Path,
    player_one: &Player,
    player_two: &Player,
) -> OverlayMediaMatches {
    let sponsor_asset_ids = catalog_asset_ids(sponsor_directory);
    let player_photo_asset_ids = catalog_asset_ids(player_photo_directory);
    OverlayMediaMatches {
        player_one: match_player_media(&sponsor_asset_ids, &player_photo_asset_ids, player_one),
        player_two: match_player_media(&sponsor_asset_ids, &player_photo_asset_ids, player_two),
    }
}

pub fn match_identity_media(
    sponsor_directory: &Path,
    player_photo_directory: &Path,
    identities: &[IdentityMediaInput],
) -> Vec<PlayerMediaMatch> {
    let sponsor_asset_ids = catalog_asset_ids(sponsor_directory);
    let player_photo_asset_ids = catalog_asset_ids(player_photo_directory);
    identities
        .iter()
        .map(|identity| match_player_media_values(
            &sponsor_asset_ids,
            &player_photo_asset_ids,
            &identity.name,
            identity.prefix.as_deref(),
            identity.sponsor.as_deref(),
        ))
        .collect()
}

fn match_player_media(
    sponsor_asset_ids: &[String],
    player_photo_asset_ids: &[String],
    player: &Player,
) -> PlayerMediaMatch {
    match_player_media_values(
        sponsor_asset_ids,
        player_photo_asset_ids,
        &player.name,
        player.prefix.as_deref(),
        player.sponsor.as_deref(),
    )
}

fn match_player_media_values(
    sponsor_asset_ids: &[String],
    player_photo_asset_ids: &[String],
    name: &str,
    prefix: Option<&str>,
    sponsor: Option<&str>,
) -> PlayerMediaMatch {
    PlayerMediaMatch {
        sponsor_logo_asset_id: match_first_asset(
            sponsor_asset_ids,
            [sponsor, prefix],
        ),
        player_photo_asset_id: match_first_asset(
            player_photo_asset_ids,
            [Some(name)],
        ),
    }
}

fn match_first_asset<'a>(
    asset_ids: &[String],
    candidates: impl IntoIterator<Item = Option<&'a str>>,
) -> Option<String> {
    candidates
        .into_iter()
        .flatten()
        .find_map(|candidate| match_unique_asset_id(asset_ids, candidate))
}

fn catalog_asset_ids(directory: &Path) -> Vec<String> {
    catalog_asset_ids_result(directory).unwrap_or_default()
}

fn catalog_asset_ids_result(directory: &Path) -> Result<Vec<String>, String> {
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("Unable to read the local game artwork catalog.".to_owned()),
    };
    Ok(entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let id = entry.file_name().into_string().ok()?;
            entry.file_type().ok()?.is_file().then_some(id)
        })
        .filter(|id| valid_media_id(id))
        .collect())
}

fn match_unique_asset_id(asset_ids: &[String], candidate: &str) -> Option<String> {
    let needle = normalize_label(candidate);
    if needle.is_empty() {
        return None;
    }
    let mut matches = asset_ids.iter().filter(|asset_id| {
        let stem = asset_id.rsplit_once('.').map_or(asset_id.as_str(), |(stem, _)| stem);
        let normalized_stem = normalize_label(stem);
        normalized_stem == needle || (
            normalized_stem.len() >= 4
            && needle.len() == normalized_stem.len() + 1
            && needle.ends_with(&normalized_stem)
        )
    });
    let matched = matches.next()?.clone();
    matches.next().is_none().then_some(matched)
}

fn valid_logo_id(value: &str) -> bool {
    let Some((stem, extension)) = value.rsplit_once('.') else {
        return false;
    };
    !stem.is_empty()
        && stem.chars().next().is_some_and(|character| character.is_ascii_alphanumeric())
        && stem.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
        && matches!(extension.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp")
}

fn valid_media_id(value: &str) -> bool {
    let Some((stem, extension)) = value.rsplit_once('.') else {
        return false;
    };
    !stem.is_empty()
        && stem.chars().next().is_some_and(char::is_alphanumeric)
        && stem.chars().all(|character| {
            character.is_alphanumeric()
                || matches!(character, '.' | '_' | '-' | ' ' | '&' | '(' | ')' | '[' | ']')
        })
        && matches!(extension.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp")
}

fn logo_label(value: &str) -> String {
    let stem = value.rsplit_once('.').map_or(value, |(stem, _)| stem);
    stem.replace(['-', '_'], " ")
        .split_whitespace()
        .map(|word| {
            let mut characters = word.chars();
            characters.next().map_or_else(String::new, |first| {
                first.to_uppercase().chain(characters).collect()
            })
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_label(value: &str) -> String {
    value.nfkd()
        .filter(|character| !is_combining_mark(*character) && character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        match_unique_asset_id, valid_game_asset_catalog_slug, valid_logo_id, valid_media_id,
        valid_raster_bytes,
    };

    #[test]
    fn logo_ids_reject_paths_and_unsupported_formats() {
        assert!(valid_logo_id("logo.png"));
        assert!(valid_media_id("ウメハラ.webp"));
        assert!(valid_media_id("Team Liquid.webp"));
        assert!(valid_media_id("Mr Game & Watch [6].jpg"));
        assert!(!valid_logo_id("../logo.png"));
        assert!(!valid_logo_id("logo.svg"));
        assert!(valid_game_asset_catalog_slug("samurai-shodown"));
        assert!(!valid_game_asset_catalog_slug("../samurai-shodown"));
        assert!(!valid_game_asset_catalog_slug("Samurai Shodown"));
        assert!(valid_raster_bytes(b"\x89PNG\r\n\x1a\nrest", "image/png"));
        assert!(valid_raster_bytes(b"\xff\xd8\xffrest", "image/jpeg"));
        assert!(valid_raster_bytes(b"RIFF0000WEBPrest", "image/webp"));
        assert!(!valid_raster_bytes(b"<svg></svg>", "image/png"));
    }

    #[test]
    fn user_media_matches_normalized_names_and_rejects_ambiguity() {
        let ids = vec!["Red-Bull.png".to_owned(), "梅原.jpg".to_owned()];
        assert_eq!(match_unique_asset_id(&ids, "Red Bull"), Some("Red-Bull.png".to_owned()));
        assert_eq!(match_unique_asset_id(&ids, "梅原"), Some("梅原.jpg".to_owned()));

        let ambiguous = vec!["Team.png".to_owned(), "team.webp".to_owned()];
        assert_eq!(match_unique_asset_id(&ambiguous, "TEAM"), None);
        assert_eq!(
            match_unique_asset_id(&["Bison.png".to_owned()], "M. Bison"),
            Some("Bison.png".to_owned())
        );
        assert_eq!(
            match_unique_asset_id(&["Honda.png".to_owned()], "E. Honda"),
            Some("Honda.png".to_owned())
        );
    }

}
