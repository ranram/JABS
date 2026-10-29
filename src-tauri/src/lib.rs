mod app_updates;
mod appearance_preferences;
mod bracket_screen;
mod catalogs;
mod commentators;
mod custom_scoreboards;
mod database;
mod diagnostics;
mod external_links;
mod fonts;
#[cfg(all(test, target_os = "linux"))]
mod glib_security_tests;
mod generated_moderation_terms;
mod local_server;
mod match_formats;
mod match_queue;
mod media_directories;
mod moderation;
mod persisted_state;
mod player_library;
mod player_stats;
mod reporting_routes;
mod result_screen;
mod runtime;
mod scoreboard_photos;
mod secrets;
mod startgg;
mod startgg_characters;
mod startgg_placements;
mod startgg_queries;
mod startgg_videogames;
mod state;
mod stingers;
mod top_eight_matchups;
mod versus_history;
mod versus_screen;
mod web_assets;

use runtime::RuntimeState;
use std::{
    sync::{atomic::Ordering, Arc},
};
use tauri::Manager;

#[tauri::command]
fn get_api_port(state: tauri::State<'_, Arc<RuntimeState>>) -> Result<u16, String> {
    let port = state.api_port.load(Ordering::Acquire);
    if port == 0 {
        return Err("JABS's local service has not started yet.".to_owned());
    }
    Ok(port)
}

#[tauri::command]
fn get_token_status(state: tauri::State<'_, Arc<RuntimeState>>) -> secrets::TokenStatus {
    secrets::status(&state)
}

#[tauri::command]
fn set_startgg_token(
    token: String,
    state: tauri::State<'_, Arc<RuntimeState>>,
) -> Result<secrets::TokenStatus, String> {
    secrets::set_persisted(&state, token)
}

#[tauri::command]
fn set_session_startgg_token(
    token: String,
    state: tauri::State<'_, Arc<RuntimeState>>,
) -> Result<secrets::TokenStatus, String> {
    secrets::set_session(&state, token)
}

#[tauri::command]
fn clear_startgg_token(
    state: tauri::State<'_, Arc<RuntimeState>>,
) -> Result<secrets::TokenStatus, String> {
    secrets::clear(&state)
}

/// Paths shown by the media-folder controls, including the application-data
/// folders used by installed builds. File requests use RuntimeState's known
/// directories, not paths sent back by the renderer.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaDirectories {
    assets_root: String,
    game_assets: String,
    players: String,
    player_headshots: String,
    sponsors: String,
    tourney_logos: String,
    moderation_allowlist: String,
}

#[tauri::command]
fn get_media_directories(state: tauri::State<'_, Arc<RuntimeState>>) -> MediaDirectories {
    MediaDirectories {
        assets_root: state
            .game_asset_directory
            .parent()
            .unwrap_or(&state.game_asset_directory)
            .display()
            .to_string(),
        game_assets: state.game_asset_directory.display().to_string(),
        players: state.player_photo_directory.display().to_string(),
        player_headshots: state.player_headshot_directory.display().to_string(),
        sponsors: state.sponsor_directory.display().to_string(),
        tourney_logos: state.logo_directory.display().to_string(),
        moderation_allowlist: state.moderation_allowlist_path.display().to_string(),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ModerationAllowlistStatus {
    entry_count: usize,
}

#[tauri::command]
fn get_moderation_allowlist() -> Result<String, String> {
    moderation::runtime_allowlist_contents()
}

#[tauri::command]
fn save_moderation_allowlist(contents: String) -> Result<ModerationAllowlistStatus, String> {
    moderation::save_runtime_allowlist(&contents)
        .map(|entry_count| ModerationAllowlistStatus { entry_count })
}

#[tauri::command]
fn reload_moderation_allowlist() -> Result<ModerationAllowlistStatus, String> {
    moderation::reload_runtime_allowlist()
        .map(|entry_count| ModerationAllowlistStatus { entry_count })
}

/// Opens one of JABS's own user-media directories in the platform file
/// manager. `kind` is allowlisted and the opened path always comes from
/// RuntimeState, so renderer code can never open an arbitrary location.
#[tauri::command]
fn open_media_directory(
    kind: String,
    subpath: Option<String>,
    state: tauri::State<'_, Arc<RuntimeState>>,
) -> Result<(), String> {
    let directory = match kind.as_str() {
        "assets" => state
            .game_asset_directory
            .parent()
            .unwrap_or(&state.game_asset_directory),
        "game-assets" => &state.game_asset_directory,
        "players" => &state.player_photo_directory,
        "player_headshots" => &state.player_headshot_directory,
        "sponsors" => &state.sponsor_directory,
        "tourney-logos" => &state.logo_directory,
        _ => return Err("Unknown media directory.".to_owned()),
    };
    let directory = media_directories::prepare(directory, subpath.as_deref())?;
    open_in_file_manager(&directory)
}

#[cfg(target_os = "windows")]
fn open_in_file_manager(directory: &std::path::Path) -> Result<(), String> {
    // explorer.exe reports a non-zero exit code for many successful opens, so
    // only a spawn failure is treated as an error.
    std::process::Command::new("explorer")
        .arg(directory)
        .spawn()
        .map(|_| ())
        .map_err(|_| "JABS could not open the media folder.".to_owned())
}

#[cfg(target_os = "macos")]
fn open_in_file_manager(directory: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(directory)
        .spawn()
        .map(|_| ())
        .map_err(|_| "JABS could not open the media folder.".to_owned())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_in_file_manager(directory: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(directory)
        .spawn()
        .map(|_| ())
        .map_err(|_| "JABS could not open the media folder.".to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let application = tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            if diagnostics::initialize(&app_data_dir).is_err() {
                eprintln!("JABS diagnostics could not be initialized.");
            }
            app_updates::register(app)?;
            let database_path = migrated_database_path(&app_data_dir)?;
            let database =
                database::Database::open(&database_path).map_err(|error| {
                    diagnostics::record(diagnostics::Event::StartupFailed, diagnostics::Context {
                        area: diagnostics::Area::Settings, reason: Some(diagnostics::Reason::Storage), ..Default::default()
                    });
                    std::io::Error::other(error)
                })?;
            diagnostics::record(diagnostics::Event::DatabaseOpened, diagnostics::Context::default());
            let development_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")));
            let sponsor_directory = if cfg!(debug_assertions) {
                development_root.join("sponsors")
            } else {
                app_data_dir.join("sponsors")
            };
            let player_photo_directory = if cfg!(debug_assertions) {
                development_root.join("players")
            } else {
                app_data_dir.join("players")
            };
            let game_asset_directory = if cfg!(debug_assertions) {
                development_root.join("game-assets")
            } else {
                app_data_dir.join("game-assets")
            };
            let custom_scoreboard_directory = app_data_dir.join("custom-scoreboards");
            let logo_directory = if cfg!(debug_assertions) {
                development_root.join("tourney-logos")
            } else {
                app_data_dir.join("tourney-logos")
            };
            std::fs::create_dir_all(&logo_directory)?;
            std::fs::create_dir_all(&sponsor_directory)?;
            std::fs::create_dir_all(&player_photo_directory)?;
            std::fs::create_dir_all(player_photo_directory.with_file_name("player_headshots"))?;
            std::fs::create_dir_all(&game_asset_directory)?;
            std::fs::create_dir_all(&custom_scoreboard_directory)?;
            let moderation_allowlist_path = if cfg!(debug_assertions) {
                development_root.join("moderation-allowlist.txt")
            } else {
                app_data_dir.join("moderation-allowlist.txt")
            };
            if let Err(error) =
                moderation::initialize_runtime_allowlist(moderation_allowlist_path.clone())
            {
                diagnostics::record(diagnostics::Event::AllowlistLoadFailed, diagnostics::Context::default());
                eprintln!("JABS could not load the moderation allowlist: {error}");
            }
            let runtime = Arc::new(
                RuntimeState::new(
                    database,
                    logo_directory,
                    sponsor_directory,
                    player_photo_directory,
                    game_asset_directory,
                    custom_scoreboard_directory,
                    moderation_allowlist_path,
                )
                .map_err(std::io::Error::other)?,
            );
            secrets::initialize(&runtime);
            diagnostics::record(diagnostics::Event::RuntimeReady, diagnostics::Context::default());
            let requested_port = runtime::requested_port()?;
            let (listener, port) = local_server::bind_loopback(requested_port).map_err(|error| {
                let reason = match error.kind() {
                    std::io::ErrorKind::AddrInUse => diagnostics::Reason::AddressInUse,
                    std::io::ErrorKind::PermissionDenied => diagnostics::Reason::Permission,
                    _ => diagnostics::Reason::Network,
                };
                diagnostics::record(diagnostics::Event::StartupFailed, diagnostics::Context {
                    reason: Some(reason), ..Default::default()
                });
                error
            })?;
            diagnostics::record(diagnostics::Event::LocalServiceStarted, diagnostics::Context::default());
            runtime.api_port.store(port, Ordering::Release);
            app.manage(runtime.clone());

            tauri::async_runtime::spawn(async move {
                if let Err(error) = local_server::serve(listener, port, runtime).await {
                    diagnostics::record(diagnostics::Event::LocalServiceStopped, diagnostics::Context::default());
                    eprintln!("JABS local service stopped: {error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_updates::get_update_support,
            app_updates::restart_app,
            get_api_port,
            get_token_status,
            set_startgg_token,
            set_session_startgg_token,
            clear_startgg_token,
            get_media_directories,
            open_media_directory,
            external_links::open_external_url,
            get_moderation_allowlist,
            save_moderation_allowlist,
            reload_moderation_allowlist,
            diagnostics::commands::report_renderer_diagnostic,
            diagnostics::commands::diagnostic_report,
            diagnostics::commands::open_logs_directory,
            diagnostics::commands::open_support_email
        ])
        .build(tauri::generate_context!());
    match application {
        Ok(app) => app.run(|_, event| {
            if matches!(event, tauri::RunEvent::Exit) { diagnostics::shutdown(true); }
        }),
        Err(error) => {
            diagnostics::record(diagnostics::Event::StartupFailed, diagnostics::Context::default());
            diagnostics::shutdown(false);
            eprintln!("JABS could not start: {error}");
            std::process::exit(1);
        }
    }
}

fn migrated_database_path(
    app_data_dir: &std::path::Path,
) -> Result<std::path::PathBuf, std::io::Error> {
    let current = app_data_dir.join("jabs.sqlite");
    if current.exists() {
        return Ok(current);
    }

    let legacy_candidates = [
        app_data_dir.join("bracketier.sqlite"),
        app_data_dir
            .parent()
            .map(|parent| parent.join("gg.jabs.app").join("jabs.sqlite"))
            .unwrap_or_default(),
        app_data_dir
            .parent()
            .map(|parent| parent.join("gg.bracketier.app").join("bracketier.sqlite"))
            .unwrap_or_default(),
    ];
    if let Some(legacy) = legacy_candidates.into_iter().find(|path| path.is_file()) {
        std::fs::copy(legacy, &current)?;
    }
    Ok(current)
}
