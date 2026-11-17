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

fn reflected_character(source: &MediaTransform) -> MediaTransform {
    MediaTransform {
        x: -source.x,
        y: source.y,
        scale: source.scale,
        flipped: !source.flipped,
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
struct LegacyPlayerContext<'a> {
    catalog: &'a str,
    side: usize,
    mode: &'a str,
    character: &'a Option<String>,
    character_asset_id: &'a Option<String>,
    photo_asset_id: &'a Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CharacterContext<'a> {
    catalog: &'a str,
    side: usize,
    mode: &'a str,
    character: &'a str,
    character_asset_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    mirrored: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PhotoContext<'a> {
    catalog: &'a str,
    side: usize,
    mode: &'a str,
    photo_asset_id: &'a Option<String>,
}

#[derive(Clone, Copy)]
pub(super) struct MediaLayerEdits {
    pub character: bool,
    pub photo: bool,
}

pub(crate) struct CharacterMediaDefault {
    pub context: String,
    pub payload: String,
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
    pub character_defaults: Vec<CharacterMediaDefault>,
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

    fn effective_mode<'a>(&self, side: usize, mode: &'a str) -> &'a str {
        if matches!(mode, "combined" | "compact:combined")
            && self.subjects.as_ref().is_some_and(|subjects| subjects[side].character_asset_id.is_none()) {
            if mode.starts_with("compact:") { "compact:photo" } else { "photo" }
        } else {
            mode
        }
    }

    pub(super) fn same_layout(&self, other: &Self, side: usize, mode: &str) -> bool {
        self.effective_mode(side, mode) == other.effective_mode(side, mode)
    }

    pub(super) fn unchanged_layers(&self, other: &Self, side: usize) -> MediaLayerEdits {
        match (&self.subjects, &other.subjects) {
            (Some(left), Some(right)) => {
                let left = &left[side];
                let right = &right[side];
                MediaLayerEdits {
                    character: left.identity == right.identity
                        && left.character == right.character
                        && left.character_asset_id == right.character_asset_id,
                    photo: left.identity == right.identity
                        && left.photo_asset_id == right.photo_asset_id,
                }
            }
            _ => MediaLayerEdits { character: true, photo: true },
        }
    }

    fn legacy_player_context(
        &self,
        side: usize,
        mode: &str,
    ) -> Result<Option<(String, String)>, String> {
        let Some(subjects) = &self.subjects else {
            return Ok(None);
        };
        let subject = &subjects[side];
        let Some(player_id) = &subject.local_id else {
            return Ok(None);
        };
        let context = serde_json::to_string(&LegacyPlayerContext {
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

    fn character_context(&self, side: usize, mode: &str, mirrored: bool) -> Result<Option<String>, String> {
        self.character_context_for_side(side, side, mode, mirrored)
    }

    fn character_context_for_side(&self, subject_side: usize, side: usize, mode: &str, mirrored: bool) -> Result<Option<String>, String> {
        let Some(subjects) = &self.subjects else {
            return Ok(None);
        };
        let subject = &subjects[subject_side];
        let (Some(character), Some(artwork)) = (&subject.character, &subject.character_asset_id)
        else {
            return Ok(None);
        };
        serde_json::to_string(&CharacterContext {
            catalog: &self.catalog,
            side,
            mode: self.effective_mode(subject_side, mode),
            character,
            character_asset_id: artwork,
            mirrored: mirrored.then_some(true),
        })
        .map(Some)
        .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())
    }

    fn photo_context(&self, side: usize, mode: &str) -> Result<Option<(String, String)>, String> {
        let Some(subjects) = &self.subjects else {
            return Ok(None);
        };
        let subject = &subjects[side];
        let Some(player_id) = &subject.local_id else {
            return Ok(None);
        };
        let context = serde_json::to_string(&PhotoContext {
            catalog: &self.catalog,
            side,
            mode: self.effective_mode(side, mode),
            photo_asset_id: &subject.photo_asset_id,
        })
        .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
        Ok(Some((player_id.clone(), context)))
    }

    pub(super) fn uses_same_character_artwork(&self) -> bool {
        self.subjects.as_ref().is_some_and(|subjects| {
            subjects[0].character.is_some()
                && subjects[0].character == subjects[1].character
                && subjects[0].character_asset_id.is_some()
                && subjects[0].character_asset_id == subjects[1].character_asset_id
        })
    }

    pub(super) fn mirror_character_edits(
        &self,
        placements: &mut [PlayerMediaPlacement; 2],
        framing_changed: [bool; 2],
    ) {
        if !self.uses_same_character_artwork() {
            return;
        }
        if let [true, false] | [false, true] = framing_changed {
            let side = usize::from(framing_changed[1]);
            placements[1 - side].character = reflected_character(&placements[side].character);
        }
    }

    pub(super) fn restore_placements(
        &self,
        database: &Database,
        mode: &str,
        mirrored: bool,
    ) -> Result<[PlayerMediaPlacement; 2], String> {
        let layouts = load_set_layouts(database, self.set_id.as_deref())?;
        let matching = |saved: &&SavedMatchMedia| {
            self.same_set(&saved.context)
                && saved.media_mode.as_deref()
                    .map_or(!mode.starts_with("compact:"), |saved_mode| saved_mode == mode)
                && valid_media_placements(&saved.placements)
        };
        let mut placements = default_media_placements();
        let mut has_mirrored_framing = [false; 2];
        for (side, placement) in placements.iter_mut().enumerate() {
            let mut saved = layouts.iter().filter(matching)
                .filter(|saved| self.same_subject(&saved.context, side));
            let latest = saved.next();
            let character = latest.filter(|saved| saved.mirrored == mirrored)
                .or_else(|| saved.find(|saved| saved.mirrored == mirrored));
            let legacy = self.load_legacy_player_default(database, side, mode)?;
            placement.character = if let Some(saved) = character {
                has_mirrored_framing[side] = mirrored;
                saved.placements[side].character.clone()
            } else if let Some(context) = self.character_context(side, mode, mirrored)? {
                let stored = database.load_character_versus_media(&context)?;
                if mirrored && stored.is_none() {
                    if let Some(saved) = layouts.iter().filter(matching)
                        .find(|saved| !saved.mirrored && self.same_subject(&saved.context, side))
                    {
                        saved.placements[side].character.clone()
                    } else if let Some(legacy) = &legacy {
                        legacy.character.clone()
                    } else if let Some(manual) = self.character_context(side, mode, false)? {
                        load_transform(database.load_character_versus_media(&manual)?)
                    } else {
                        MediaTransform::default()
                    }
                } else if !mirrored && legacy.is_some() {
                    legacy.as_ref().unwrap().character.clone()
                } else {
                    has_mirrored_framing[side] = mirrored;
                    load_transform(stored)
                }
            } else {
                legacy.as_ref().map(|value| value.character.clone()).unwrap_or_default()
            };
            placement.photo = if let Some(saved) = latest {
                saved.placements[side].photo.clone()
            } else if let Some(legacy) = legacy {
                legacy.photo
            } else if let Some((player_id, context)) = self.photo_context(side, mode)? {
                load_transform(database.load_player_versus_media(&player_id, &context)?)
            } else {
                MediaTransform::default()
            };
        }
        if mirrored && mode != "photo" && mode != "compact:photo" {
            let source = match has_mirrored_framing {
                [true, true] => [false, false],
                [false, true] => [false, true],
                _ => [true, false],
            };
            self.mirror_character_edits(&mut placements, source);
        }
        Ok(placements)
    }

    fn load_legacy_player_default(
        &self,
        database: &Database,
        side: usize,
        mode: &str,
    ) -> Result<Option<PlayerMediaPlacement>, String> {
        let Some((player_id, context)) = self.legacy_player_context(side, mode)? else {
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
        mirrored: bool,
        placements: &[PlayerMediaPlacement; 2],
        edited: [MediaLayerEdits; 2],
        framing_changed: [bool; 2],
    ) -> Result<MediaEdits, String> {
        let mut edits = MediaEdits::default();
        if let Some(set_id) = &self.set_id {
            let mut layouts = load_set_layouts(database, Some(set_id))?;
            layouts.retain(|saved| {
                self.same_set(&saved.context)
                    && (saved.mirrored != mirrored || saved
                        .media_mode
                        .as_deref()
                        .map_or(mode.starts_with("compact:"), |saved_mode| saved_mode != mode))
                    && valid_media_placements(&saved.placements)
            });
            let saved = SavedMatchMedia {
                context: self.clone(),
                placements: placements.clone(),
                media_mode: Some(mode.into()),
                mirrored,
            };
            layouts.insert(0, saved);
            let payload = serde_json::to_string(&SavedSetMedia::Layouts { layouts })
                .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
            edits.set_media = Some((set_id.clone(), payload));
        }
        for (side, changed) in edited.into_iter().enumerate() {
            if !changed.character && !changed.photo {
                continue;
            }
            // Update an existing personal override only when its owner actually edits it.
            if let Some(mut legacy) = self.load_legacy_player_default(database, side, mode)? {
                if !mirrored && changed.character {
                    legacy.character = placements[side].character.clone();
                }
                if changed.photo {
                    legacy.photo = placements[side].photo.clone();
                }
                if let Some((player_id, context)) = self.legacy_player_context(side, mode)? {
                    edits.player_defaults.push(PlayerMediaDefault {
                        player_id,
                        context,
                        payload: serialize_placement(&legacy)?,
                    });
                }
            }
            if changed.character {
                if let Some(context) = self.character_context(side, mode, mirrored)? {
                    edits.character_defaults.push(CharacterMediaDefault {
                        context,
                        payload: serialize_placement(&placements[side].character)?,
                    });
                }
            }
            if framing_changed[side] {
                if let Some(context) = self.character_context_for_side(side, 1 - side, mode, mirrored)? {
                    let opposite_was_edited = framing_changed[1 - side]
                        && self.character_context(1 - side, mode, mirrored)?.as_ref() == Some(&context);
                    if !opposite_was_edited {
                        let mirrored = reflected_character(&placements[side].character);
                        edits.character_defaults.push(CharacterMediaDefault {
                            context,
                            payload: serialize_placement(&mirrored)?,
                        });
                    }
                }
            }
            if changed.photo {
                if let Some((player_id, context)) = self.photo_context(side, mode)? {
                    edits.player_defaults.push(PlayerMediaDefault {
                        player_id,
                        context,
                        payload: serialize_placement(&placements[side].photo)?,
                    });
                }
            }
        }
        Ok(edits)
    }
}

fn serialize_placement(value: &impl Serialize) -> Result<String, String> {
    serde_json::to_string(value)
        .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())
}

fn load_transform(payload: Option<String>) -> MediaTransform {
    payload
        .and_then(|value| serde_json::from_str::<MediaTransform>(&value).ok())
        .filter(MediaTransform::is_valid)
        .unwrap_or_default()
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SavedMatchMedia {
    context: MediaMatch,
    pub(super) placements: [PlayerMediaPlacement; 2],
    #[serde(default)]
    media_mode: Option<String>,
    #[serde(default)]
    mirrored: bool,
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
