use crate::{
    artwork_framing::ArtworkFraming, database::Database, versus_screen::CharacterMediaDefault,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;

const MAX_GROUPS: usize = 512;
const MAX_MEMBERS: usize = 64;
static EDIT: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FramingGroup {
    #[serde(default)]
    pub(crate) number: u32,
    pub(crate) anchor: String,
    pub(crate) members: Vec<String>,
    #[serde(default)]
    pub(crate) use_shared_for_adjusted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) framing_key: Option<String>,
    #[serde(default, skip_serializing_if = "ArtworkFraming::is_empty")]
    pub(crate) framing_snapshot: ArtworkFraming,
}

impl FramingGroup {
    pub(crate) fn framing_source(&self) -> &str {
        self.framing_key.as_deref().unwrap_or(&self.anchor)
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GroupEdit {
    pub(crate) number: Option<u32>,
    pub(crate) anchor: String,
    pub(crate) members: Vec<String>,
    #[serde(default)]
    pub(crate) use_shared_for_adjusted: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GroupCatalog {
    next_number: u32,
    groups: Vec<FramingGroup>,
}

fn load_catalog(database: &Database, catalog: &str) -> Result<GroupCatalog, String> {
    let Some(payload) =
        database.load_broadcast_surface(&format!("character-framing-groups:{catalog}"))?
    else {
        return Ok(GroupCatalog {
            next_number: 1,
            groups: Vec::new(),
        });
    };
    if let Ok(saved) = serde_json::from_str::<GroupCatalog>(&payload) {
        return Ok(saved);
    }
    let mut groups = serde_json::from_str::<Vec<FramingGroup>>(&payload)
        .map_err(|_| "Could not read artwork groups.")?;
    for (index, group) in groups.iter_mut().enumerate() {
        group.number = index as u32 + 1;
    }
    Ok(GroupCatalog {
        next_number: groups.len() as u32 + 1,
        groups,
    })
}

pub(crate) fn load(database: &Database, catalog: &str) -> Result<Vec<FramingGroup>, String> {
    Ok(load_catalog(database, catalog)?.groups)
}

fn preserve_group_framing(
    database: &Database,
    catalog: &str,
    group: &mut FramingGroup,
) -> Result<Vec<CharacterMediaDefault>, String> {
    if group.framing_key.is_some() {
        return Ok(Vec::new());
    }
    let key = format!("@group/{}", group.number);
    for surface in ["player-stats", "result-screen"] {
        let Some(payload) = database.load_broadcast_surface(surface)? else {
            continue;
        };
        let state: Value =
            serde_json::from_str(&payload).map_err(|_| "Could not read saved artwork framing.")?;
        let Some(framing) = state.get("artworkFraming") else {
            continue;
        };
        let framing = serde_json::from_value::<ArtworkFraming>(framing.clone())
            .map_err(|_| "Could not read saved artwork framing.")?;
        for (context, mut placement) in framing {
            let Ok(mut scope) = serde_json::from_str::<Vec<Value>>(&context) else {
                continue;
            };
            if scope.get(1).and_then(Value::as_str) == Some(catalog)
                && scope.get(2).and_then(Value::as_str) == Some("character")
                && scope.get(4).and_then(Value::as_str) == Some(group.anchor.as_str())
            {
                scope[4] = Value::String(key.clone());
                placement.flipped = false;
                group.framing_snapshot.insert(
                    serde_json::to_string(&scope).map_err(|_| "Could not save artwork framing.")?,
                    placement,
                );
            }
        }
    }
    let placements = database.copy_versus_character_defaults(catalog, &group.anchor, &key)?;
    group.framing_key = Some(key);
    Ok(placements)
}

pub(crate) fn save(
    database: &Database,
    catalog: &str,
    artwork: &[crate::catalogs::GameCharacterAsset],
    group: GroupEdit,
) -> Result<Vec<FramingGroup>, String> {
    let valid_id = |id: &String| !id.is_empty() && id.chars().count() <= 255;
    if group.members.len() > MAX_MEMBERS
        || !valid_id(&group.anchor)
        || !group.members.iter().all(valid_id)
        || group.members.contains(&group.anchor)
        || group
            .members
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != group.members.len()
        || (!group.members.is_empty()
            && !artwork.iter().any(|character| {
                character.has_artwork(&group.anchor)
                    && group.members.iter().all(|id| character.has_artwork(id))
            }))
    {
        return Err("Choose distinct artwork for the same character.".into());
    }
    let _edit = EDIT.lock().map_err(|_| "Artwork groups are unavailable.")?;
    let mut saved = load_catalog(database, catalog)?;
    let existing = saved
        .groups
        .iter()
        .position(|entry| Some(entry.number) == group.number);
    if group.number.is_some()
        && !existing.is_some_and(|index| saved.groups[index].anchor == group.anchor)
    {
        return Err("This artwork group changed. Reopen the group and try again.".into());
    }
    let destination = existing.map(|index| saved.groups.remove(index));
    let mut placements = Vec::new();
    if !group.members.is_empty() {
        let moved = |id: &String| id == &group.anchor || group.members.contains(id);
        for source in &mut saved.groups {
            source.members.retain(|id| !moved(id));
            if moved(&source.anchor) {
                if !source.members.is_empty() {
                    placements.extend(preserve_group_framing(database, catalog, source)?);
                    source.anchor = source.members.remove(0);
                } else {
                    source.anchor.clear();
                }
            }
        }
        saved.groups.retain(|source| !source.anchor.is_empty());
        if saved.groups.len() >= MAX_GROUPS {
            return Err("This game has reached its artwork group limit.".into());
        }
        let mut destination = if let Some(group) = destination {
            group
        } else {
            let number = saved.next_number;
            saved.next_number = number
                .checked_add(1)
                .ok_or("This game has reached its artwork group limit.")?;
            FramingGroup {
                number,
                anchor: group.anchor,
                members: Vec::new(),
                use_shared_for_adjusted: false,
                framing_key: None,
                framing_snapshot: ArtworkFraming::new(),
            }
        };
        destination.members = group.members;
        destination.use_shared_for_adjusted = group.use_shared_for_adjusted;
        saved.groups.push(destination);
        saved.groups.sort_by_key(|group| group.number);
    } else if destination.is_none() {
        return Ok(saved.groups);
    }
    database.save_broadcast_surface_with_media(
        &format!("character-framing-groups:{catalog}"),
        &serde_json::to_string(&saved).map_err(|_| "Could not save artwork groups.")?,
        &crate::database::now_rfc3339()?,
        None,
        &[],
        &placements,
    )?;
    Ok(saved.groups)
}
