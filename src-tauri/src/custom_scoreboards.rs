use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const CANVAS_WIDTH: u32 = 1920;
const CANVAS_HEIGHT: u32 = 1080;
pub const MAX_FRAME_BYTES: usize = 20 * 1024 * 1024;

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomScoreboard {
    pub version: u8,
    pub id: String,
    pub name: String,
    pub frame_revision: String,
    pub regions: ScoreboardRegions,
    #[serde(default)]
    pub player_elements: PlayerElementRegions,
    pub visibility: ScoreboardVisibility,
    pub typography: ScoreboardTypography,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreboardRegions {
    pub player_one: ScoreboardRegion,
    pub player_two: ScoreboardRegion,
    pub match_label: ScoreboardRegion,
    pub logo: ScoreboardRegion,
    pub info_left: ScoreboardRegion,
    pub info_center: ScoreboardRegion,
    pub info_right: ScoreboardRegion,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreboardRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub align: String,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerElementRegions {
    pub player_one: SideElementRegions,
    pub player_two: SideElementRegions,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideElementRegions {
    pub flag: ScoreboardRegion,
    pub sponsor: ScoreboardRegion,
    #[serde(default = "default_x_handle")]
    pub x_handle: ScoreboardRegion,
    pub name: ScoreboardRegion,
    pub pronouns: ScoreboardRegion,
    pub seed: ScoreboardRegion,
    pub score: ScoreboardRegion,
}

fn default_x_handle() -> ScoreboardRegion {
    region(0, 0, 100, 20, "left")
}

impl Default for PlayerElementRegions {
    fn default() -> Self {
        Self {
            player_one: SideElementRegions {
                flag: region(32, 28, 68, 46, "center"),
                sponsor: region(116, 18, 500, 26, "left"),
                x_handle: region(116, 46, 520, 20, "left"),
                name: region(116, 68, 520, 46, "left"),
                pronouns: region(116, 118, 240, 24, "left"),
                seed: region(368, 118, 180, 24, "left"),
                score: region(680, 26, 92, 72, "center"),
            },
            player_two: SideElementRegions {
                flag: region(1820, 28, 68, 46, "center"),
                sponsor: region(1304, 18, 500, 26, "right"),
                x_handle: region(1284, 46, 520, 20, "right"),
                name: region(1284, 68, 520, 46, "right"),
                pronouns: region(1564, 118, 240, 24, "right"),
                seed: region(1372, 118, 180, 24, "right"),
                score: region(1148, 26, 92, 72, "center"),
            },
        }
    }
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreboardVisibility {
    pub flags: bool,
    pub sponsors: bool,
    #[serde(default)]
    pub x_handles: bool,
    #[serde(default = "default_true")]
    pub pronouns: bool,
    #[serde(default = "default_true")]
    pub seeds: bool,
    pub round: bool,
    pub tournament_logo: bool,
    pub bottom_rails: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreboardTypography {
    pub text_color: String,
    pub outline: String,
    pub name_size: u32,
    pub meta_size: u32,
    pub score_size: u32,
    pub context_size: u32,
}

pub fn list(root: &Path) -> Result<Vec<CustomScoreboard>, String> {
    std::fs::create_dir_all(root)
        .map_err(|_| "Unable to prepare the custom scoreboard folder.".to_owned())?;
    let entries =
        std::fs::read_dir(root).map_err(|_| "Unable to read custom scoreboards.".to_owned())?;
    let mut scoreboards = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            if !entry.file_type().ok()?.is_dir() {
                return None;
            }
            load(root, entry.file_name().to_str()?).ok()
        })
        .collect::<Vec<_>>();
    scoreboards.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(scoreboards)
}

pub fn load(root: &Path, id: &str) -> Result<CustomScoreboard, String> {
    if !valid_id(id) {
        return Err("Choose a valid custom scoreboard.".to_owned());
    }
    let payload = std::fs::read_to_string(root.join(id).join("manifest.json"))
        .map_err(|_| "Unable to read the custom scoreboard layout.".to_owned())?;
    let mut scoreboard = serde_json::from_str::<CustomScoreboard>(&payload)
        .map_err(|_| "The custom scoreboard layout is invalid.".to_owned())?;
    normalize_restricted_regions(&mut scoreboard);
    validate(&scoreboard)?;
    if scoreboard.id != id || !root.join(id).join("frame.png").is_file() {
        return Err("The custom scoreboard files do not match their catalog entry.".to_owned());
    }
    Ok(scoreboard)
}

pub fn import(root: &Path, name: &str, bytes: &[u8]) -> Result<CustomScoreboard, String> {
    validate_name(name)?;
    validate_png(bytes)?;
    std::fs::create_dir_all(root)
        .map_err(|_| "Unable to prepare the custom scoreboard folder.".to_owned())?;
    let revision = crate::database::now_rfc3339()?;
    let suffix = time::OffsetDateTime::now_utc()
        .unix_timestamp_nanos()
        .unsigned_abs();
    let id = format!("scoreboard-{suffix:x}");
    let directory = root.join(&id);
    std::fs::create_dir(&directory)
        .map_err(|_| "Unable to create the custom scoreboard.".to_owned())?;
    if std::fs::write(directory.join("frame.png"), bytes).is_err() {
        let _ = std::fs::remove_dir(&directory);
        return Err("Unable to save the custom scoreboard image.".to_owned());
    }
    let scoreboard = default_scoreboard(id, name.trim().to_owned(), revision);
    if let Err(error) = save(root, scoreboard.clone()) {
        let _ = std::fs::remove_dir_all(&directory);
        return Err(error);
    }
    Ok(scoreboard)
}

pub fn save(root: &Path, scoreboard: CustomScoreboard) -> Result<(), String> {
    validate(&scoreboard)?;
    let directory = root.join(&scoreboard.id);
    if !directory.join("frame.png").is_file() {
        return Err("The custom scoreboard image is missing.".to_owned());
    }
    let payload = serde_json::to_vec_pretty(&scoreboard)
        .map_err(|_| "Unable to prepare the custom scoreboard layout.".to_owned())?;
    std::fs::write(directory.join("manifest.json"), payload)
        .map_err(|_| "Unable to save the custom scoreboard layout.".to_owned())
}

pub fn delete(root: &Path, id: &str) -> Result<(), String> {
    load(root, id)?;
    std::fs::remove_dir_all(root.join(id))
        .map_err(|_| "Unable to delete the custom scoreboard.".to_owned())
}

pub fn frame_path(root: &Path, id: &str) -> Option<PathBuf> {
    load(root, id).ok()?;
    Some(root.join(id).join("frame.png"))
}

pub fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && !value.starts_with('-')
        && value
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
}

fn validate(scoreboard: &CustomScoreboard) -> Result<(), String> {
    if scoreboard.version != 1 || !valid_id(&scoreboard.id) {
        return Err("The custom scoreboard version or ID is invalid.".to_owned());
    }
    validate_name(&scoreboard.name)?;
    if scoreboard.frame_revision.len() > 64 || scoreboard.frame_revision.trim().is_empty() {
        return Err("The custom scoreboard revision is invalid.".to_owned());
    }
    for region in [
        &scoreboard.regions.player_one,
        &scoreboard.regions.player_two,
        &scoreboard.regions.match_label,
        &scoreboard.regions.logo,
        &scoreboard.regions.info_left,
        &scoreboard.regions.info_center,
        &scoreboard.regions.info_right,
    ] {
        validate_region(region)?;
    }
    for region in player_regions(&scoreboard.player_elements.player_one) {
        validate_region_in_bounds(region, 0, 0, 960, 250)?;
    }
    for region in player_regions(&scoreboard.player_elements.player_two) {
        validate_region_in_bounds(region, 960, 0, 960, 250)?;
    }
    for region in [
        &scoreboard.regions.logo,
        &scoreboard.regions.info_left,
        &scoreboard.regions.info_center,
        &scoreboard.regions.info_right,
    ] {
        validate_region_in_bounds(region, 0, 780, 1920, 300)?;
    }
    let type_settings = &scoreboard.typography;
    if !valid_color(&type_settings.text_color)
        || !matches!(type_settings.outline.as_str(), "none" | "soft" | "strong")
        || !(12..=96).contains(&type_settings.name_size)
        || !(10..=64).contains(&type_settings.meta_size)
        || !(16..=120).contains(&type_settings.score_size)
        || !(10..=64).contains(&type_settings.context_size)
    {
        return Err("Choose valid custom scoreboard typography settings.".to_owned());
    }
    Ok(())
}

fn validate_region(region: &ScoreboardRegion) -> Result<(), String> {
    let horizontal_end = region.x.checked_add(region.width);
    let vertical_end = region.y.checked_add(region.height);
    if region.width < 20
        || region.height < 20
        || horizontal_end.is_none_or(|end| end > CANVAS_WIDTH)
        || vertical_end.is_none_or(|end| end > CANVAS_HEIGHT)
        || !matches!(region.align.as_str(), "left" | "center" | "right")
    {
        return Err("Keep every custom scoreboard region inside the 1920×1080 canvas.".to_owned());
    }
    Ok(())
}

fn validate_region_in_bounds(
    region: &ScoreboardRegion,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    validate_region(region)?;
    if region.x < x
        || region.y < y
        || region.x + region.width > x + width
        || region.y + region.height > y + height
    {
        return Err("Keep this scoreboard element inside its allowed area.".to_owned());
    }
    Ok(())
}

fn normalize_restricted_regions(scoreboard: &mut CustomScoreboard) {
    for region in [
        &mut scoreboard.regions.logo,
        &mut scoreboard.regions.info_left,
        &mut scoreboard.regions.info_center,
        &mut scoreboard.regions.info_right,
    ] {
        clamp_region(region, 0, 780, 1920, 300);
    }
}

fn clamp_region(region: &mut ScoreboardRegion, x: u32, y: u32, width: u32, height: u32) {
    region.width = region.width.min(width);
    region.height = region.height.min(height);
    region.x = region.x.clamp(x, x + width - region.width);
    region.y = region.y.clamp(y, y + height - region.height);
}

fn player_regions(side: &SideElementRegions) -> [&ScoreboardRegion; 7] {
    [
        &side.flag,
        &side.sponsor,
        &side.x_handle,
        &side.name,
        &side.pronouns,
        &side.seed,
        &side.score,
    ]
}

fn validate_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 60 || name.chars().any(char::is_control) {
        return Err("Enter a custom scoreboard name between 1 and 60 characters.".to_owned());
    }
    Ok(())
}

fn valid_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|ch| ch.is_ascii_hexdigit())
}

fn validate_png(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_FRAME_BYTES
        || bytes.len() < 33
        || bytes.get(..8) != Some(b"\x89PNG\r\n\x1a\n")
        || bytes.get(12..16) != Some(b"IHDR")
    {
        return Err("Choose a valid PNG no larger than 20 MB.".to_owned());
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap_or_default());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap_or_default());
    let color_type = bytes[25];
    let palette_transparency = bytes.windows(4).any(|window| window == b"tRNS");
    if width != CANVAS_WIDTH || height != CANVAS_HEIGHT {
        return Err("Custom scoreboards must be exactly 1920×1080.".to_owned());
    }
    if !matches!(color_type, 4 | 6) && !(color_type == 3 && palette_transparency) {
        return Err("Choose a PNG with transparency.".to_owned());
    }
    Ok(())
}

fn default_scoreboard(id: String, name: String, frame_revision: String) -> CustomScoreboard {
    CustomScoreboard {
        version: 1,
        id,
        name,
        frame_revision,
        regions: ScoreboardRegions {
            player_one: region(40, 18, 760, 88, "left"),
            player_two: region(1120, 18, 760, 88, "right"),
            match_label: region(810, 18, 300, 48, "center"),
            logo: region(850, 900, 220, 130, "center"),
            info_left: region(40, 1030, 640, 32, "left"),
            info_center: region(700, 1030, 520, 32, "center"),
            info_right: region(1240, 1030, 640, 32, "right"),
        },
        player_elements: PlayerElementRegions::default(),
        visibility: ScoreboardVisibility {
            flags: true,
            sponsors: true,
            x_handles: false,
            pronouns: true,
            seeds: true,
            round: true,
            tournament_logo: true,
            bottom_rails: true,
        },
        typography: ScoreboardTypography {
            text_color: "#ffffff".to_owned(),
            outline: "strong".to_owned(),
            name_size: 30,
            meta_size: 17,
            score_size: 38,
            context_size: 18,
        },
    }
}

fn region(x: u32, y: u32, width: u32, height: u32, align: &str) -> ScoreboardRegion {
    ScoreboardRegion {
        x,
        y,
        width,
        height,
        align: align.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::{default_scoreboard, normalize_restricted_regions, validate};

    #[test]
    fn older_bottom_regions_are_clamped_into_the_supported_area() {
        let mut scoreboard = default_scoreboard(
            "scoreboard-test".to_owned(),
            "Test".to_owned(),
            "revision".to_owned(),
        );
        scoreboard.regions.logo.y = 40;
        scoreboard.regions.info_left.height = 600;

        normalize_restricted_regions(&mut scoreboard);

        assert_eq!(scoreboard.regions.logo.y, 780);
        assert_eq!(scoreboard.regions.info_left.height, 300);
        assert!(validate(&scoreboard).is_ok());
    }
}
