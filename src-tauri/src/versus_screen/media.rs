use crate::database::Database;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaTransform {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    #[serde(default)]
    pub flipped: bool,
}

impl Default for MediaTransform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale: 1.0,
            flipped: false,
        }
    }
}

impl MediaTransform {
    pub fn is_valid(&self) -> bool {
        self.x.is_finite()
            && (-0.85..=0.85).contains(&self.x)
            && self.y.is_finite()
            && (-0.85..=0.85).contains(&self.y)
            && self.scale.is_finite()
            && (0.35..=2.5).contains(&self.scale)
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMediaPlacement {
    pub character: MediaTransform,
    pub photo: MediaTransform,
}

pub(super) fn default_media_placements() -> [PlayerMediaPlacement; 2] {
    [
        PlayerMediaPlacement::default(),
        PlayerMediaPlacement::default(),
    ]
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct MediaSubject {
    local_id: Option<String>,
    identity: String,
    character: Option<String>,
    character_asset_id: Option<String>,
    photo_asset_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(super) struct MediaMatch {
    set_id: Option<String>,
    event_id: Option<String>,
    videogame_id: Option<String>,
    catalog: String,
    #[serde(default)]
    subjects: Option<[MediaSubject; 2]>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DefaultContext<'a> {
    catalog: &'a str,
    side: usize,
    mode: &'a str,
    character: &'a Option<String>,
    character_asset_id: &'a Option<String>,
    photo_asset_id: &'a Option<String>,
}

pub(crate) struct PlayerMediaDefault {
    pub player_id: String,
    pub context: String,
    pub payload: String,
}

#[derive(Default)]
pub(super) struct MediaEdits {
    pub set_media: Option<(String, String)>,
    pub player_defaults: Vec<PlayerMediaDefault>,
}

pub(super) fn same_selection(
    left: &crate::state::SelectedSet,
    right: &crate::state::SelectedSet,
) -> bool {
    MediaMatch::from(left).same_set(&MediaMatch::from(right))
        && same_player_media(&left.player_one, &right.player_one)
        && same_player_media(&left.player_two, &right.player_two)
}

fn same_player_media(left: &crate::state::Player, right: &crate::state::Player) -> bool {
    left.local_player_id == right.local_player_id
        && left.player_id == right.player_id
        && left.entrant_id == right.entrant_id
        && left.name == right.name
        && left.characters == right.characters
        && left.character == right.character
        && left.character_asset_id == right.character_asset_id
        && left.player_photo_asset_id == right.player_photo_asset_id
}

impl From<&crate::state::SelectedSet> for MediaMatch {
    fn from(selected: &crate::state::SelectedSet) -> Self {
        Self {
            set_id: selected.set_id.clone(),
            event_id: selected.event_id.clone(),
            videogame_id: selected.videogame_id.clone(),
            catalog: selected
                .asset_catalog_slug
                .as_ref()
                .unwrap_or(&selected.game_id)
                .clone(),
            subjects: None,
        }
    }
}

impl MediaMatch {
    pub(super) fn resolve(
        database: &Database,
        artwork_directory: &std::path::Path,
        photo_directory: &std::path::Path,
        selected: &crate::state::SelectedSet,
    ) -> Result<Self, String> {
        let mut context = Self::from(selected);
        let has_characters = [&selected.player_one, &selected.player_two]
            .iter()
            .any(|player| !player.characters.is_empty() || player.character.is_some());
        let assets = if has_characters {
            crate::catalogs::list_game_character_assets(artwork_directory, &context.catalog)?
        } else {
            Vec::new()
        };
        let photos = crate::catalogs::catalog_asset_ids_result(photo_directory)?;
        let resolve = |player: &crate::state::Player| -> Result<MediaSubject, String> {
            let local_id = match player.local_player_id.as_deref() {
                Some(id) if database.library_player(id)?.is_some() => Some(id),
                _ => None,
            };
            let record = database.library_resolve(local_id, player.player_id.as_deref())?;
            let local_id = record.map(|record| record.local_id);
            let identity = match (&local_id, &player.player_id) {
                (Some(id), _) => format!("local:{id}"),
                (_, Some(id)) => format!("startgg:{id}"),
                _ => format!("entrant:{}:{}", player.entrant_id, player.name),
            };
            let photo_asset_id = player
                .player_photo_asset_id
                .clone()
                .or_else(|| crate::catalogs::match_unique_asset_id(&photos, &player.name));
            Ok(MediaSubject {
                local_id,
                identity,
                character: player
                    .characters
                    .first()
                    .or(player.character.as_ref())
                    .cloned(),
                character_asset_id: crate::catalogs::selected_character_artwork(&assets, player),
                photo_asset_id,
            })
        };
        context.subjects = Some([
            resolve(&selected.player_one)?,
            resolve(&selected.player_two)?,
        ]);
        Ok(context)
    }

    pub(super) fn same_set(&self, other: &Self) -> bool {
        self.set_id == other.set_id
            && self.event_id == other.event_id
            && self.videogame_id == other.videogame_id
            && self.catalog == other.catalog
    }

    pub(super) fn same_subject(&self, other: &Self, side: usize) -> bool {
        match (&self.subjects, &other.subjects) {
            (Some(left), Some(right)) => left[side] == right[side],
            // Older set saves did not include artwork or player identities.
            _ => true,
        }
    }

    fn default_context(&self, side: usize, mode: &str) -> Result<Option<(String, String)>, String> {
        let Some(subjects) = &self.subjects else {
            return Ok(None);
        };
        let subject = &subjects[side];
        let Some(player_id) = &subject.local_id else {
            return Ok(None);
        };
        let context = serde_json::to_string(&DefaultContext {
            catalog: &self.catalog,
            side,
            mode,
            character: &subject.character,
            character_asset_id: &subject.character_asset_id,
            photo_asset_id: &subject.photo_asset_id,
        })
        .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
        Ok(Some((player_id.clone(), context)))
    }

    pub(super) fn restore_placements(
        &self,
        database: &Database,
        mode: &str,
    ) -> Result<[PlayerMediaPlacement; 2], String> {
        let layouts = load_set_layouts(database, self.set_id.as_deref())?;
        let saved = layouts.iter().find(|saved| {
            self.same_set(&saved.context)
                && saved
                    .media_mode
                    .as_deref()
                    .is_none_or(|saved_mode| saved_mode == mode)
                && valid_media_placements(&saved.placements)
        });
        let mut placements = default_media_placements();
        for (side, placement) in placements.iter_mut().enumerate() {
            if let Some(saved) = saved {
                if self.same_subject(&saved.context, side) {
                    *placement = saved.placements[side].clone();
                    continue;
                }
            }
            if let Some(default) = self.load_player_default(database, side, mode)? {
                *placement = default;
            }
        }
        Ok(placements)
    }

    fn load_player_default(
        &self,
        database: &Database,
        side: usize,
        mode: &str,
    ) -> Result<Option<PlayerMediaPlacement>, String> {
        let Some((player_id, context)) = self.default_context(side, mode)? else {
            return Ok(None);
        };
        let Some(payload) = database.load_player_versus_media(&player_id, &context)? else {
            return Ok(None);
        };
        let Ok(placement) = serde_json::from_str::<PlayerMediaPlacement>(&payload) else {
            return Ok(None);
        };
        if !placement.character.is_valid() || !placement.photo.is_valid() {
            return Ok(None);
        }
        Ok(Some(placement))
    }

    pub(super) fn serialize_edits(
        &self,
        database: &Database,
        mode: &str,
        placements: &[PlayerMediaPlacement; 2],
        edited: [bool; 2],
    ) -> Result<MediaEdits, String> {
        let mut edits = MediaEdits::default();
        if let Some(set_id) = &self.set_id {
            let mut layouts = load_set_layouts(database, Some(set_id))?;
            layouts.retain(|saved| {
                self.same_set(&saved.context)
                    && saved
                        .media_mode
                        .as_deref()
                        .is_some_and(|saved_mode| saved_mode != mode)
                    && valid_media_placements(&saved.placements)
            });
            let saved = SavedMatchMedia {
                context: self.clone(),
                placements: placements.clone(),
                media_mode: Some(mode.into()),
            };
            layouts.insert(0, saved);
            let payload = serde_json::to_string(&SavedSetMedia::Layouts { layouts })
                .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
            edits.set_media = Some((set_id.clone(), payload));
        }
        for (side, was_edited) in edited.into_iter().enumerate() {
            if !was_edited {
                continue;
            }
            if let Some((player_id, context)) = self.default_context(side, mode)? {
                let payload = serde_json::to_string(&placements[side])
                    .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
                edits.player_defaults.push(PlayerMediaDefault {
                    player_id,
                    context,
                    payload,
                });
            }
        }
        Ok(edits)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SavedMatchMedia {
    context: MediaMatch,
    pub(super) placements: [PlayerMediaPlacement; 2],
    #[serde(default)]
    media_mode: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(untagged)]
enum SavedSetMedia {
    Layouts { layouts: Vec<SavedMatchMedia> },
    Legacy(SavedMatchMedia),
}

pub(super) fn load_set_layouts(
    database: &Database,
    set_id: Option<&str>,
) -> Result<Vec<SavedMatchMedia>, String> {
    let Some(set_id) = set_id else {
        return Ok(Vec::new());
    };
    let Some(payload) = database.load_set_versus_media(set_id)? else {
        return Ok(Vec::new());
    };
    match serde_json::from_str::<SavedSetMedia>(&payload) {
        Ok(SavedSetMedia::Layouts { layouts }) => Ok(layouts),
        Ok(SavedSetMedia::Legacy(saved)) => Ok(vec![saved]),
        Err(_) => Ok(Vec::new()),
    }
}

pub(super) fn valid_media_placements(placements: &[PlayerMediaPlacement; 2]) -> bool {
    placements
        .iter()
        .all(|placement| placement.character.is_valid() && placement.photo.is_valid())
}
