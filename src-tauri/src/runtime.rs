use std::{path::PathBuf, sync::{Mutex, atomic::{AtomicBool, AtomicU16}}};
use zeroize::Zeroizing;
use crate::{commentators::CommentatorStore, database::Database, result_screen::ResultScreenStore, startgg::StartggService, state::OverlayStore, versus_screen::VersusScreenStore};

pub const DEFAULT_API_PORT: u16 = 4279;

pub struct RuntimeState {
    pub api_port: AtomicU16,
    pub secure_storage_available: AtomicBool,
    pub session_token: Mutex<Option<Zeroizing<String>>>,
    pub overlay: OverlayStore,
    pub commentators: CommentatorStore,
    pub result_screen: ResultScreenStore,
    pub versus_screen: VersusScreenStore,
    pub startgg: StartggService,
    pub database: Database,
    pub logo_directory: PathBuf,
    pub sponsor_directory: PathBuf,
    pub player_photo_directory: PathBuf,
    pub game_asset_directory: PathBuf,
    pub custom_scoreboard_directory: PathBuf,
    pub moderation_allowlist_path: PathBuf,
    pub reporting_set_id: tokio::sync::Mutex<Option<String>>,
}

impl RuntimeState {
    pub fn new(
        database: Database,
        logo_directory: PathBuf,
        sponsor_directory: PathBuf,
        player_photo_directory: PathBuf,
        game_asset_directory: PathBuf,
        custom_scoreboard_directory: PathBuf,
        moderation_allowlist_path: PathBuf,
    ) -> Result<Self, String> {
        let overlay = OverlayStore::load(&database)?;
        let commentators = CommentatorStore::load(&database, &logo_directory)?;
        let result_screen = ResultScreenStore::load(&database)?;
        let versus_screen = VersusScreenStore::load(&database)?;
        Ok(Self {
            api_port: AtomicU16::new(0),
            secure_storage_available: AtomicBool::new(false),
            session_token: Mutex::new(None),
            overlay,
            commentators,
            result_screen,
            versus_screen,
            startgg: StartggService::default(),
            database,
            logo_directory,
            sponsor_directory,
            player_photo_directory,
            game_asset_directory,
            custom_scoreboard_directory,
            moderation_allowlist_path,
            reporting_set_id: tokio::sync::Mutex::new(None),
        })
    }
}

pub fn requested_port() -> Result<u16, Box<dyn std::error::Error>> {
    let Some(value) = std::env::var_os("JABS_PORT")
        .or_else(|| std::env::var_os("BRACKETIER_PORT")) else {
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
