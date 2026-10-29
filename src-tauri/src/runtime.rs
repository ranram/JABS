use crate::{
    commentators::CommentatorStore, database::Database, result_screen::ResultScreenStore,
    startgg::StartggService, state::OverlayStore, top_eight_matchups::TopEightMatchupsStore,
    versus_screen::VersusScreenStore,
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU16},
        Mutex,
    },
};
use zeroize::Zeroizing;

pub const DEFAULT_API_PORT: u16 = 4279;

pub struct RuntimeState {
    pub api_port: AtomicU16,
    pub secure_storage_available: AtomicBool,
    pub session_token: Mutex<Option<Zeroizing<String>>>,
    pub overlay: OverlayStore,
    pub match_queue: crate::match_queue::QueueStore,
    pub commentators: CommentatorStore,
    pub result_screen: ResultScreenStore,
    pub stingers: crate::stingers::StingerStore,
    pub stinger_directory: PathBuf,
    pub appearance: crate::appearance_preferences::AppearanceStore,
    pub bracket_screen: crate::bracket_screen::BracketScreenStore,
    pub versus_screen: VersusScreenStore,
    pub versus_history: crate::versus_history::HistoryCache,
    pub player_stats: crate::player_stats::StatsCache,
    pub player_stats_settings: crate::player_stats::SettingsStore,
    pub top_eight_matchups: TopEightMatchupsStore,
    pub startgg: StartggService,
    pub database: Database,
    pub logo_directory: PathBuf,
    pub sponsor_directory: PathBuf,
    pub player_photo_directory: PathBuf,
    pub player_headshot_directory: PathBuf,
    pub scoreboard_photos: crate::scoreboard_photos::PhotoStore,
    pub game_asset_directory: PathBuf,
    pub custom_scoreboard_directory: PathBuf,
    pub moderation_allowlist_path: PathBuf,
    pub reporting_set_id: tokio::sync::Mutex<Option<String>>,
    pub asset_catalog_revision: tokio::sync::watch::Sender<u64>,
    pub asset_changes: crate::catalogs::changes::AssetChangeTracker,
}

impl RuntimeState {
    pub fn observe_startgg_sets(&self, event_id: &str, sets: &[serde_json::Value]) -> Result<(), String> {
        let reset_ids = self.match_queue.observe_bracket(&self.database, event_id, sets)?;
        let live_reset = self.overlay.observe_bracket_state(&self.database, event_id, sets, &reset_ids)?;
        for set_id in reset_ids.into_iter().chain(live_reset) {
            self.stingers.reset_set_completion(&set_id);
        }
        Ok(())
    }

    pub fn new(
        database: Database,
        logo_directory: PathBuf,
        sponsor_directory: PathBuf,
        player_photo_directory: PathBuf,
        game_asset_directory: PathBuf,
        custom_scoreboard_directory: PathBuf,
        moderation_allowlist_path: PathBuf,
    ) -> Result<Self, String> {
        for error in crate::catalogs::repair_existing_character_folders(&game_asset_directory) {
            crate::diagnostics::record(crate::diagnostics::Event::ArtworkSetupFailed,
                crate::diagnostics::Context { area: crate::diagnostics::Area::Assets, ..Default::default() });
            eprintln!("JABS artwork setup: {error}");
        }
        let overlay = OverlayStore::load(&database)?;
        // A new app session starts without the previous tournament's live match.
        overlay.clear_selected_set(&database)?;
        let commentators = CommentatorStore::load(&database, &logo_directory)?;
        let result_screen = ResultScreenStore::load(&database)?;
        let versus_screen = VersusScreenStore::load(&database)?;
        let top_eight_matchups = TopEightMatchupsStore::load(&database)?;
        let player_headshot_directory = player_photo_directory.with_file_name("player_headshots");
        let asset_changes = crate::catalogs::changes::AssetChangeTracker::new(vec![
            logo_directory.clone(), sponsor_directory.clone(), player_photo_directory.clone(),
            player_headshot_directory.clone(), game_asset_directory.clone(), custom_scoreboard_directory.clone(),
        ]);
        Ok(Self {
            api_port: AtomicU16::new(0),
            secure_storage_available: AtomicBool::new(false),
            session_token: Mutex::new(None),
            overlay,
            match_queue: crate::match_queue::QueueStore::load(&database)?,
            commentators,
            result_screen,
            stingers: crate::stingers::StingerStore::load(&database)?,
            stinger_directory: custom_scoreboard_directory.with_file_name("stingers"),
            appearance: crate::appearance_preferences::AppearanceStore::load(&database)?,
            bracket_screen: crate::bracket_screen::BracketScreenStore::load(&database)?,
            versus_screen,
            versus_history: Default::default(),
            player_stats: Default::default(),
            player_stats_settings: crate::player_stats::SettingsStore::load(&database)?,
            top_eight_matchups,
            startgg: StartggService::default(),
            scoreboard_photos: crate::scoreboard_photos::PhotoStore::load(&database)?,
            player_headshot_directory,
            asset_changes,
            database,
            logo_directory,
            sponsor_directory,
            player_photo_directory,
            game_asset_directory,
            custom_scoreboard_directory,
            moderation_allowlist_path,
            reporting_set_id: tokio::sync::Mutex::new(None),
            // A restarted app must also invalidate caches in OBS sources left open.
            asset_catalog_revision: tokio::sync::watch::channel(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            ).0,
        })
    }
}

pub fn requested_port() -> Result<u16, Box<dyn std::error::Error>> {
    let Some(value) = std::env::var_os("JABS_PORT").or_else(|| std::env::var_os("BRACKETIER_PORT"))
    else {
        return Ok(DEFAULT_API_PORT);
    };
    let value = value
        .into_string()
        .map_err(|_| "JABS_PORT must be valid Unicode")?;
    let port = value
        .parse::<u16>()
        .map_err(|_| "JABS_PORT must be an integer from 1 through 65535")?;
    if port == 0 {
        return Err("JABS_PORT must be an integer from 1 through 65535".into());
    }
    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_session_clears_the_previous_tournament_match() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let overlay = OverlayStore::load(&database).unwrap();
        let mut previous = overlay.selected_set().unwrap();
        previous.set_id = Some("123".to_owned());
        previous.event_id = Some("456".to_owned());
        previous.tournament_slug = Some("last-tournament".to_owned());
        previous.game_name = Some("Tekken 8".to_owned());
        previous.game_id = "tekken-8".to_owned();
        previous.videogame_id = Some("49783".to_owned());
        previous.asset_catalog_slug = Some("tekken-8".to_owned());
        previous.player_one.name = "Previous player".to_owned();
        overlay
            .replace_selected_set(
                &database,
                std::path::Path::new("unused"),
                std::path::Path::new("unused"),
                previous,
            )
            .unwrap();
        overlay.set_score(&database, "one", 1).unwrap();

        let directory = PathBuf::from("unused");
        let runtime = RuntimeState::new(
            database,
            directory.clone(),
            directory.clone(),
            directory.clone(),
            directory.clone(),
            directory.clone(),
            directory,
        )
        .unwrap();
        let selected = runtime.overlay.selected_set().unwrap();
        assert!(selected.set_id.is_none());
        assert!(selected.event_id.is_none());
        assert!(selected.tournament_slug.is_none());
        assert!(selected.game_name.is_none());
        assert!(selected.videogame_id.is_none());
        assert!(selected.asset_catalog_slug.is_none());
        assert_eq!(selected.player_one.name, "Player 1");
        assert_eq!(selected.player_one.score, 0);
        assert_eq!(selected.player_two.score, 0);
        assert!(selected.game_history.unwrap().is_empty());
        assert_eq!(
            OverlayStore::load(&runtime.database)
                .unwrap()
                .current()
                .unwrap(),
            runtime.overlay.current().unwrap()
        );
    }
}
