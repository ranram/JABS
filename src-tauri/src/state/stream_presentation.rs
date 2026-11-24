use super::{BroadcastPresentation, SelectedSet};

#[derive(Default)]
pub(super) struct StreamPresentation {
    first_to: bool,
    station: Option<Option<String>>,
    broadcast: Option<Option<BroadcastPresentation>>,
    style: Option<ScoreboardStyle>,
}

#[derive(Clone, PartialEq, Eq)]
struct ScoreboardStyle {
    game_id: Option<String>,
    custom_id: Option<String>,
    custom_revision: Option<String>,
}

impl ScoreboardStyle {
    fn from_set(set: &SelectedSet) -> Self {
        Self {
            game_id: set.styling_game_id.clone(),
            custom_id: set.custom_scoreboard_id.clone(),
            custom_revision: set.custom_scoreboard_revision.clone(),
        }
    }
}

impl StreamPresentation {
    pub(super) fn record_edit(&mut self, previous: &SelectedSet, next: &SelectedSet) {
        if next.set_id.is_some() {
            self.first_to = next.show_first_to;
        }
        if previous.station != next.station {
            self.station = Some(next.station.clone());
        }
        if previous.broadcast != next.broadcast {
            self.broadcast = Some(next.broadcast.clone());
        }
        let style = ScoreboardStyle::from_set(next);
        if style != ScoreboardStyle::from_set(previous) {
            self.style = Some(style);
        }
    }

    pub(super) fn apply(&self, set: &mut SelectedSet) {
        set.show_first_to = set.set_id.is_some() && self.first_to;
        if let Some(station) = &self.station {
            set.station = station.clone();
        }
        if let Some(broadcast) = &self.broadcast {
            set.broadcast = broadcast.clone();
        }
        self.apply_style(set);
    }

    pub(super) fn apply_style(&self, set: &mut SelectedSet) {
        if let Some(style) = &self.style {
            set.styling_game_id = style.game_id.clone();
            set.custom_scoreboard_id = style.custom_id.clone();
            set.custom_scoreboard_revision = style.custom_revision.clone();
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{database::Database, state::{OverlayStore, report_readiness}};
    use std::path::Path;

    #[test]
    fn stream_edits_follow_the_session_and_keep_the_startgg_scoring_rules() {
        let database = Database::open(Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let assets = Path::new("/jabs-no-test-assets");
        let mut selected = store.selected_set().unwrap();
        selected.set_id = Some("100".into());
        selected.best_of = 19;
        selected.startgg_best_of = Some(19);
        store.replace_selected_set(&database, assets, assets, selected).unwrap();

        let mut edit = store.selected_set().unwrap();
        edit.best_of = 3;
        edit.startgg_best_of = Some(3);
        edit.match_format = Some("first-to".into());
        edit.show_first_to = true;
        edit.station = Some("Feature station".into());
        edit.round = Some("Local round title".into());
        edit.styling_game_id = Some("tekken-8".into());
        edit.broadcast.as_mut().unwrap().info_bar_enabled = true;
        edit.broadcast.as_mut().unwrap().info_left = Some("!bracket".into());
        store.update_selected_set(&database, assets, assets, edit).unwrap();
        store.set_score(&database, "one", 9).unwrap();
        assert!(report_readiness(&store.selected_set().unwrap(), None).is_err());
        store.set_score(&database, "one", 10).unwrap();

        let restored = OverlayStore::load(&database).unwrap().selected_set().unwrap();
        assert_eq!(restored.best_of, 19);
        assert_eq!(restored.match_format.as_deref(), Some("best-of"));
        assert_eq!(report_readiness(&restored, None).unwrap().winner_score, 10);

        let mut next = super::super::default_state().selected_set;
        next.set_id = Some("200".into());
        next.best_of = 7;
        next.startgg_best_of = Some(7);
        next.round = Some("Winners Final".into());
        next.station = Some("Station 2".into());
        store.clear_selected_set(&database).unwrap();
        let version = store.selected_set().unwrap().updated_at;
        store.replace_selected_set_if_current(&database, assets, assets, next.clone(), Some(&version)).unwrap();
        let active = store.selected_set().unwrap();
        assert!(active.show_first_to);
        assert_eq!(active.startgg_best_of, Some(7));
        assert_eq!(active.round.as_deref(), Some("Winners Final"));
        assert_eq!(active.station.as_deref(), Some("Feature station"));
        assert_eq!(active.styling_game_id.as_deref(), Some("tekken-8"));
        assert_eq!(active.broadcast.as_ref().unwrap().info_left.as_deref(), Some("!bracket"));
        assert_eq!(active.player_one.score, 0);

        let restarted = OverlayStore::load(&database).unwrap();
        restarted.replace_selected_set(&database, assets, assets, next).unwrap();
        let active = restarted.selected_set().unwrap();
        assert!(!active.show_first_to);
        assert_eq!(active.station.as_deref(), Some("Station 2"));
    }

}
