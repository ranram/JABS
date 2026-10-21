use super::character_assets::{
    character_asset, character_asset_directory, character_portrait_directory, rosters,
};
use super::{catalog_asset_ids_result, valid_media_id};
use std::{
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

pub fn built_in_roster(game_id: &str) -> Option<Vec<String>> {
    rosters().get(game_id).cloned()
}

pub fn local_character_roster(root: &Path, game_id: &str) -> Option<Vec<String>> {
    built_in_roster(game_id).or_else(|| saved_roster(root, game_id))
}

/// Fills gaps in existing folders at startup using names already on this computer.
/// Each game is independent, so a read-only folder cannot prevent other repairs.
pub fn repair_existing_character_folders(root: &Path) -> Vec<String> {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Vec::new(),
        Err(_) => return vec!["Could not check the game artwork folders.".to_owned()],
    };
    let mut errors = Vec::new();
    for entry in entries.flatten() {
        let Some(game) = entry.file_name().to_str().map(str::to_owned) else { continue };
        if !super::valid_game_asset_catalog_slug(&game)
            || !entry.file_type().is_ok_and(|kind| kind.is_dir())
        {
            continue;
        }
        if let Some(characters) = local_character_roster(root, &game) {
            if let Err(error) = prepare_character_files(root, &game, &characters) {
                errors.push(format!("Could not finish character setup for {game}: {error}"));
            }
        }
    }
    errors
}

pub(super) fn saved_roster(root: &Path, game_id: &str) -> Option<Vec<String>> {
    let path = root.join(game_id).join(".jabs-roster.json");
    let metadata = fs::symlink_metadata(&path).ok()?;
    if !metadata.is_file() || metadata.len() > 128 * 1024 {
        return None;
    }
    let characters: Vec<String> = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    if characters.len() > 512
        || characters
            .iter()
            .any(|name| name.is_empty() || name.len() > 180)
    {
        return None;
    }
    Some(characters)
}

/// Creates empty character files so users know what to name their artwork.
/// The media catalog ignores these files until they contain an image.
pub fn prepare_character_files(
    root: &Path,
    game_id: &str,
    characters: &[String],
) -> Result<usize, String> {
    if !super::valid_game_asset_catalog_slug(game_id) {
        return Err("Choose a valid game before preparing artwork folders.".to_owned());
    }
    let game_directory = root.join(game_id);
    let directories = [
        character_asset_directory(root, game_id),
        character_portrait_directory(root, game_id),
    ];
    for directory in [&game_directory, &directories[0], &directories[1]] {
        fs::create_dir_all(directory).map_err(|_| "Unable to prepare the game artwork folders.")?;
        if !fs::symlink_metadata(directory).is_ok_and(|metadata| metadata.is_dir()) {
            return Err("Game artwork folders must be local directories.".to_owned());
        }
    }
    write_new_file(
        &root.join("README.md"),
        include_str!("../../../game-assets/README.md").as_bytes(),
    )?;
    // Save the roster's original names: punctuation and numbers can otherwise
    // be mistaken for filename separators or outfit numbers.
    if !characters.is_empty() && !rosters().contains_key(game_id) {
        save_roster_if_changed(root, game_id, characters)?;
    }
    let aliases = super::character_assets::aliases().get(game_id);
    let mut created = 0;
    for directory in &directories {
        let existing = catalog_asset_ids_result(directory)?;
        for character in characters {
            if character_asset(character, &existing, &[], aliases).is_some() {
                continue;
            }
            let Some(filename) = placeholder_filename(character) else {
                continue;
            };
            if write_new_file(&directory.join(filename), &[])? {
                created += 1;
            }
        }
    }
    Ok(created)
}

fn save_roster_if_changed(root: &Path, game_id: &str, characters: &[String]) -> Result<(), String> {
    if saved_roster(root, game_id).as_deref() == Some(characters) {
        return Ok(());
    }
    let bytes =
        serde_json::to_vec(characters).map_err(|_| "Unable to save the character roster.")?;
    let game_directory = root.join(game_id);
    static NEXT_FILE: AtomicU64 = AtomicU64::new(0);
    let temporary = game_directory.join(format!(
        ".jabs-roster-{}-{}.tmp",
        std::process::id(),
        NEXT_FILE.fetch_add(1, Ordering::Relaxed)
    ));
    if !write_new_file(&temporary, &bytes)? {
        return Err("Unable to save the character roster.".to_owned());
    }
    // Write a complete replacement before touching the saved roster.
    // A failed write leaves the previous list available.
    if fs::rename(&temporary, game_directory.join(".jabs-roster.json")).is_err() {
        let _ = fs::remove_file(temporary);
        return Err("Unable to save the character roster.".to_owned());
    }
    Ok(())
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<bool, String> {
    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(mut file) => {
            file.write_all(bytes)
                .map_err(|_| "Unable to prepare character files.")?;
            Ok(true)
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Ok(false),
        Err(_) => Err("Unable to prepare character files.".to_owned()),
    }
}

fn placeholder_filename(name: &str) -> Option<String> {
    let stem: String = name
        .trim()
        .chars()
        .filter(|character| {
            character.is_alphanumeric()
                || matches!(
                    character,
                    '.' | '_' | '-' | ' ' | '&' | '(' | ')' | '[' | ']'
                )
        })
        .collect();
    let stem = stem.trim_matches([' ', '.']);
    // Windows reserves these names even when they have an image extension.
    let device = stem.split('.').next()?.to_ascii_uppercase();
    if stem.len() > 180
        || matches!(device.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (device.len() == 4
            && (device.starts_with("COM") || device.starts_with("LPT"))
            && matches!(device.as_bytes()[3], b'1'..=b'9'))
    {
        return None;
    }
    let filename = format!("{stem}.png");
    valid_media_id(&filename).then_some(filename)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalogs::{
        asset_catalog_summary, list_game_character_assets, resolve_game_character_asset,
    };

    #[test]
    fn placeholders_preserve_artwork_and_become_usable_only_after_replacement() {
        let root =
            std::env::temp_dir().join(format!("jabs-character-setup-{}", std::process::id()));
        let game = "custom-fighter";
        let directory = root.join(game).join("characters");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("Ryu.webp"), b"RIFF0000WEBPartwork").unwrap();
        let names = vec!["Ryu".to_owned(), "Android 18".to_owned(), "K'".to_owned()];
        assert_eq!(prepare_character_files(&root, game, &names).unwrap(), 5);
        assert!(!directory.join("Ryu.png").exists());
        assert_eq!(
            fs::read(directory.join("Ryu.webp")).unwrap(),
            b"RIFF0000WEBPartwork"
        );
        assert_eq!(
            fs::metadata(directory.join("Android 18.png"))
                .unwrap()
                .len(),
            0
        );
        assert_eq!(prepare_character_files(&root, game, &names).unwrap(), 0);
        let assets = list_game_character_assets(&root, game).unwrap();
        let android = assets
            .iter()
            .find(|asset| serde_json::to_value(asset).unwrap()["character"] == "Android 18")
            .unwrap();
        let android = serde_json::to_value(android).unwrap();
        assert!(android.get("assetId").is_none());
        assert!(android["variants"].as_array().unwrap().is_empty());
        assert!(resolve_game_character_asset(&root, game, "Android 18.png").is_none());
        let database = crate::database::Database::open(Path::new(":memory:")).unwrap();
        let stream = crate::state::OverlayStore::load(&database).unwrap();
        let mut selected = stream.selected_set().unwrap();
        selected.asset_catalog_slug = Some(game.to_owned());
        selected.player_one.characters = vec!["Android 18".to_owned()];
        // A fetched character can be selected before the user supplies artwork.
        stream.replace_selected_set(&database, &root, &root, selected).unwrap();
        let summary = asset_catalog_summary(
            &root.join("logos"),
            &root.join("sponsors"),
            &root.join("players"),
            &root,
            game,
        )
        .unwrap();
        let summary = serde_json::to_value(summary).unwrap();
        assert_eq!(summary["counts"]["characterArt"], 1);
        assert_eq!(summary["counts"]["characterPortraits"], 0);
        fs::write(directory.join("Android 18.webp"), b"RIFF0000WEBPartwork").unwrap();
        let assets =
            serde_json::to_value(list_game_character_assets(&root, game).unwrap()).unwrap();
        assert_eq!(assets.as_array().unwrap().len(), 3);
        assert_eq!(
            assets
                .as_array()
                .unwrap()
                .iter()
                .find(|asset| asset["character"] == "Android 18")
                .unwrap()["assetId"],
            "Android 18.webp"
        );
        assert!(resolve_game_character_asset(&root, game, "Android 18.webp").is_some());
        fs::write(directory.join("New Challenger.webp"), b"RIFF0000WEBPartwork").unwrap();
        let assets = serde_json::to_value(list_game_character_assets(&root, game).unwrap()).unwrap();
        assert_eq!(assets.as_array().unwrap().len(), 4);
        assert!(assets.as_array().unwrap().iter().any(|asset| {
            asset["character"] == "New Challenger"
                && asset["assetId"] == "New Challenger.webp"
        }));
        assert!(prepare_character_files(&root, "../outside", &names).is_err());
        for name in ["../", "CON", "LPT1", "..."] {
            assert!(placeholder_filename(name).is_none());
        }
        assert_eq!(placeholder_filename("K'").as_deref(), Some("K.png"));
        // Reopening JABS repairs each folder, including games with real artwork.
        for (game, missing) in [("street-fighter-6", "Arjun"), ("marvel-tokon", "Phoenix Cyclops")] {
            let artwork = root.join(game).join("characters");
            fs::create_dir_all(&artwork).unwrap();
            fs::write(artwork.join("Ryu.webp"), b"RIFF0000WEBPartwork").unwrap();
            assert!(repair_existing_character_folders(&root).is_empty());
            let portrait = root.join(game).join("portraits").join(format!("{missing}.png"));
            assert_eq!(fs::metadata(&portrait).unwrap().len(), 0);
            fs::remove_file(&portrait).unwrap();
            assert!(repair_existing_character_folders(&root).is_empty());
            assert!(portrait.exists());
            assert_eq!(fs::read(artwork.join("Ryu.webp")).unwrap(), b"RIFF0000WEBPartwork");
        }
        fs::remove_dir_all(root).unwrap();
    }
}
