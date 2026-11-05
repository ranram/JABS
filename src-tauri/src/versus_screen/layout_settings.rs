use super::media::MediaMatch;
use super::{PlayerMediaPlacement, VersusScreenState};
use serde::{Deserialize, Serialize};

/// Display preferences are local to one Versus information layout.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LayoutSettings {
    context: Option<MediaMatch>,
    styling_game_id: Option<String>,
    logo_asset_id: Option<String>,
    show_background: bool,
    show_match_backdrop: bool,
    show_tournament_logo: bool,
    show_sponsor_logos: bool,
    show_head_to_head: bool,
    #[serde(default = "super::default_true")]
    show_scrolling_rails: bool,
    stat_rows: Vec<String>,
    media_mode: String,
    media_placements: [PlayerMediaPlacement; 2],
}

impl LayoutSettings {
    pub(super) fn capture(state: &VersusScreenState) -> Self {
        Self {
            context: state.media_match.clone(),
            styling_game_id: state.styling_game_id.clone(),
            logo_asset_id: state.logo_asset_id.clone(),
            show_background: state.show_background,
            show_match_backdrop: state.show_match_backdrop,
            show_tournament_logo: state.show_tournament_logo,
            show_sponsor_logos: state.show_sponsor_logos,
            show_head_to_head: state.show_head_to_head,
            show_scrolling_rails: state.show_scrolling_rails,
            stat_rows: state.stat_rows.clone(),
            media_mode: state.media_mode.clone(),
            media_placements: state.media_placements.clone(),
        }
    }

    pub(super) fn preserve_matching_framing(&self, state: &mut VersusScreenState) {
        let (Some(saved), Some(current)) = (&self.context, &state.media_match) else {
            return;
        };
        if !current.same_set(saved) {
            return;
        }
        let scope = media_scope(state);
        for side in 0..2 {
            if !current.same_layout(saved, side, &scope) {
                continue;
            }
            let unchanged = current.unchanged_layers(saved, side);
            if unchanged.character {
                state.media_placements[side].character =
                    self.media_placements[side].character.clone();
            }
            if unchanged.photo {
                state.media_placements[side].photo = self.media_placements[side].photo.clone();
            }
        }
    }

    pub(super) fn apply(&self, state: &mut VersusScreenState) {
        state.styling_game_id = self.styling_game_id.clone();
        state.logo_asset_id = self.logo_asset_id.clone();
        state.show_background = self.show_background;
        state.show_match_backdrop = self.show_match_backdrop;
        state.show_tournament_logo = self.show_tournament_logo;
        state.show_sponsor_logos = self.show_sponsor_logos;
        state.show_head_to_head = self.show_head_to_head;
        state.show_scrolling_rails = self.show_scrolling_rails;
        state.stat_rows = self.stat_rows.clone();
        state.media_mode = self.media_mode.clone();
        state.media_placements = self.media_placements.clone();
    }
}

/// Keep Standard keys unchanged so existing match and player framing still loads.
pub(super) fn media_scope(state: &VersusScreenState) -> String {
    if state.information_layout == "compact" {
        format!("compact:{}", state.media_mode)
    } else {
        state.media_mode.clone()
    }
}
