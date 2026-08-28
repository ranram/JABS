use super::{catalog_asset_ids_result, normalize_label, resolve_media_path};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap},
    path::{Path, PathBuf},
    sync::OnceLock,
};

const ROSTER_JSON: &str = include_str!("../../resources/character_rosters.json");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCharacterAsset {
    character: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    portrait_asset_id: Option<String>,
    variants: Vec<GameCharacterAssetVariant>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCharacterAssetVariant {
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    portrait_asset_id: Option<String>,
}

fn rosters() -> &'static HashMap<String, Vec<String>> {
    static ROSTERS: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    ROSTERS.get_or_init(|| {
        serde_json::from_str(ROSTER_JSON).expect("compiled character catalog must be valid")
    })
}

pub fn is_character_for_game(game_id: &str, character: &str) -> bool {
    rosters().get(game_id).is_some_and(|characters| {
        characters.iter().any(|candidate| candidate == character)
    })
}

/// Resolves external character metadata to the canonical JABS roster label.
pub fn canonical_character_for_catalog(
    root_directory: &Path,
    game_id: &str,
    character: &str,
) -> Option<String> {
    let normalized = normalize_character_label(character);
    if normalized.is_empty() {
        return None;
    }
    if let Some(characters) = rosters().get(game_id) {
        return characters
            .iter()
            .find(|candidate| normalize_character_label(candidate) == normalized)
            .cloned();
    }
    list_game_character_assets(root_directory, game_id)
        .ok()?
        .into_iter()
        .find(|candidate| normalize_character_label(&candidate.character) == normalized)
        .map(|candidate| candidate.character)
}

pub fn has_game_character_asset(
    root_directory: &Path,
    game_id: &str,
    character: &str,
) -> bool {
    list_game_character_assets(root_directory, game_id).is_ok_and(|assets| {
        assets.iter().any(|asset| asset.character == character
            && (asset.asset_id.is_some() || asset.portrait_asset_id.is_some()))
    })
}

pub fn list_game_character_assets(
    root_directory: &Path,
    game_id: &str,
) -> Result<Vec<GameCharacterAsset>, String> {
    if !valid_game_asset_catalog_slug(game_id) {
        return Err("Choose a valid game asset catalog before loading character artwork.".to_owned());
    }
    let directory = character_asset_directory(root_directory, game_id);
    let portrait_directory = character_portrait_directory(root_directory, game_id);
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Unable to prepare the local game artwork catalog.".to_owned())?;
    std::fs::create_dir_all(&portrait_directory)
        .map_err(|_| "Unable to prepare the local game portrait catalog.".to_owned())?;
    let mut asset_ids = catalog_asset_ids_result(&directory)?;
    let mut portrait_asset_ids = catalog_asset_ids_result(&portrait_directory)?;
    asset_ids.sort_by_key(|asset_id| asset_id.to_lowercase());
    portrait_asset_ids.sort_by_key(|asset_id| asset_id.to_lowercase());
    let mut assets = if let Some(characters) = rosters().get(game_id) {
        characters
            .iter()
            .filter_map(|character| character_asset(character, &asset_ids, &portrait_asset_ids))
            .collect::<Vec<_>>()
    } else {
        dynamic_character_labels(&asset_ids, &portrait_asset_ids)
            .into_values()
            .filter_map(|character| character_asset(&character, &asset_ids, &portrait_asset_ids))
            .collect::<Vec<_>>()
    };
    assets.sort_by(|left, right| left.character.to_lowercase().cmp(&right.character.to_lowercase()));
    assets.dedup_by(|left, right| normalize_label(&left.character) == normalize_label(&right.character));
    Ok(assets)
}

fn dynamic_character_labels(
    asset_ids: &[String],
    portrait_asset_ids: &[String],
) -> BTreeMap<String, String> {
    let mut labels = BTreeMap::new();
    for asset_id in asset_ids.iter().chain(portrait_asset_ids.iter()) {
        let (base, _) = split_variant_suffix(asset_stem(asset_id));
        let label = media_stem_label(base);
        let normalized = normalize_character_label(&label);
        if !normalized.is_empty() {
            labels.entry(normalized).or_insert(label);
        }
    }
    labels
}

pub fn resolve_game_character_asset(
    root_directory: &Path,
    game_id: &str,
    asset_id: &str,
) -> Option<(PathBuf, &'static str)> {
    let assets = list_game_character_assets(root_directory, game_id).ok()?;
    assets.iter().any(|asset| asset.variants.iter().any(|variant| {
        variant.asset_id.as_deref() == Some(asset_id)
    })).then(|| resolve_media_path(&character_asset_directory(root_directory, game_id), asset_id))?
}

pub fn resolve_game_character_portrait(
    root_directory: &Path,
    game_id: &str,
    asset_id: &str,
) -> Option<(PathBuf, &'static str)> {
    let assets = list_game_character_assets(root_directory, game_id).ok()?;
    assets.iter().any(|asset| asset.variants.iter().any(|variant| {
        variant.portrait_asset_id.as_deref() == Some(asset_id)
    })).then(|| resolve_media_path(&character_portrait_directory(root_directory, game_id), asset_id))?
}

pub(super) fn character_asset_directory(root_directory: &Path, game_id: &str) -> PathBuf {
    root_directory.join(game_id).join("characters")
}

pub(super) fn character_portrait_directory(root_directory: &Path, game_id: &str) -> PathBuf {
    root_directory.join(game_id).join("portraits")
}

pub fn valid_game_asset_catalog_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && !value.starts_with('-')
        && !value.ends_with('-')
        && !value.contains("--")
        && value.chars().all(|character| character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || character == '-')
}

fn media_stem_label(value: &str) -> String {
    value.replace(['-', '_'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn asset_stem(asset_id: &str) -> &str {
    asset_id.rsplit_once('.').map_or(asset_id, |(stem, _)| stem)
}

fn split_variant_suffix(stem: &str) -> (&str, Option<u32>) {
    let stem = stem.trim();
    for (opening, closing) in [('(', ')'), ('[', ']')] {
        if stem.ends_with(closing) {
            if let Some(index) = stem.rfind(opening) {
                let digits = &stem[index + opening.len_utf8()..stem.len() - closing.len_utf8()];
                if let Ok(number) = digits.trim().parse::<u32>() {
                    let base = stem[..index].trim_end_matches([' ', '-', '_']);
                    if number > 0 && !base.is_empty() {
                        return (base, Some(number));
                    }
                }
            }
        }
    }
    let digit_count = stem.chars().rev().take_while(char::is_ascii_digit).count();
    if digit_count == 0 {
        return (stem, None);
    }
    let digits_start = stem.len() - digit_count;
    let base = stem[..digits_start].trim_end_matches([' ', '-', '_']);
    let number = stem[digits_start..].parse::<u32>().ok().filter(|number| *number > 0);
    if base.is_empty() || number.is_none() { (stem, None) } else { (base, number) }
}

fn character_asset(
    character: &str,
    asset_ids: &[String],
    portrait_asset_ids: &[String],
) -> Option<GameCharacterAsset> {
    let mut variants = BTreeMap::<Option<u32>, (Option<String>, Option<String>)>::new();
    for (asset_id, portrait) in asset_ids.iter().map(|id| (id, false))
        .chain(portrait_asset_ids.iter().map(|id| (id, true)))
    {
        let stem = asset_stem(asset_id);
        let variant = if character_names_match(character, stem) {
            Some(None)
        } else {
            let (base, variant) = split_variant_suffix(stem);
            variant.filter(|_| character_names_match(character, base)).map(Some)
        };
        let Some(variant) = variant else { continue };
        let entry = variants.entry(variant).or_default();
        let target = if portrait { &mut entry.1 } else { &mut entry.0 };
        if target.is_none() {
            *target = Some(asset_id.clone());
        }
    }
    if variants.is_empty() {
        return None;
    }
    let variants = variants.into_iter().map(
        |(number, (asset_id, portrait_asset_id))| GameCharacterAssetVariant {
            label: number.map_or_else(|| "Default".to_owned(), |number| number.to_string()),
            asset_id,
            portrait_asset_id,
        }
    ).collect::<Vec<_>>();
    Some(GameCharacterAsset {
        character: character.to_owned(),
        asset_id: variants.iter().find_map(|variant| variant.asset_id.clone()),
        portrait_asset_id: variants.iter().find_map(|variant| variant.portrait_asset_id.clone()),
        variants,
    })
}

fn normalize_character_label(value: &str) -> String {
    normalize_label(&value.replace('&', " and "))
}

pub fn character_names_match(left: &str, right: &str) -> bool {
    let left = normalize_character_label(left);
    !left.is_empty() && left == normalize_character_label(right)
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_character_for_catalog, has_game_character_asset, list_game_character_assets,
    };

    #[test]
    fn imported_names_and_flexible_variant_filenames_use_the_canonical_character() {
        let root = std::env::temp_dir().join(format!(
            "jabs-character-variants-{}-{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("catalog")
        ));
        let directory = root.join("super-smash-bros-ultimate").join("characters");
        std::fs::create_dir_all(&directory).expect("variant catalog directory should be created");
        for asset_id in [
            "Mr Game and Watch 1.png", "mrgameandwatch2.png", "mr-game-and-watch-3.jpg",
            "MrGameAndWatch4.jpg", "MrGame&Watch (5).png", "Mr Game & Watch [6].jpg",
            "MRGaMeAnDWatCH-7.png", "Pyra and Mythra (1).png", "pyra-and-mythra-2.webp",
        ] {
            std::fs::write(directory.join(asset_id), b"variant test")
                .expect("variant catalog fixture should be written");
        }
        assert_eq!(
            canonical_character_for_catalog(&root, "super-smash-bros-ultimate", "Mr. Game & Watch").as_deref(),
            Some("Mr Game and Watch")
        );
        let assets = list_game_character_assets(&root, "super-smash-bros-ultimate")
            .expect("known character variants should load");
        let character = assets.iter().find(|asset| asset.character == "Mr Game and Watch")
            .expect("flexible filenames should resolve to the canonical character");
        assert_eq!(character.variants.len(), 7);
        assert_eq!(
            character.variants.iter().map(|variant| variant.label.as_str()).collect::<Vec<_>>(),
            vec!["1", "2", "3", "4", "5", "6", "7"]
        );
        let duo = assets.iter().find(|asset| asset.character == "Pyra and Mythra")
            .expect("Pyra and Mythra should share one canonical roster entry");
        assert_eq!(duo.variants.len(), 2);
        std::fs::remove_dir_all(&root).expect("variant catalog fixture should be removed");
    }

    #[test]
    fn unsupported_games_group_numbered_assets_without_a_built_in_roster() {
        let root = std::env::temp_dir().join(format!(
            "jabs-dynamic-catalog-{}-{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("catalog")
        ));
        let directory = root.join("samurai-shodown").join("characters");
        let portrait_directory = root.join("samurai-shodown").join("portraits");
        std::fs::create_dir_all(&directory).expect("dynamic catalog directory should be created");
        std::fs::create_dir_all(&portrait_directory).expect("portrait catalog directory should be created");
        std::fs::write(directory.join("Haohmaru-1.png"), b"catalog test").unwrap();
        std::fs::write(directory.join("haohmaru2.webp"), b"catalog test").unwrap();
        std::fs::write(portrait_directory.join("Haohmaru.webp"), b"portrait test").unwrap();
        let assets = list_game_character_assets(&root, "samurai-shodown").unwrap();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].character, "Haohmaru");
        assert_eq!(assets[0].variants.len(), 3);
        assert!(has_game_character_asset(&root, "samurai-shodown", "Haohmaru"));
        assert!(!has_game_character_asset(&root, "samurai-shodown", "Forged fighter"));
        std::fs::remove_dir_all(&root).expect("dynamic catalog fixture should be removed");
    }
}
