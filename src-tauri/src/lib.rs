mod local_server;
mod catalogs;
mod commentators;
mod custom_scoreboards;
mod result_screen;
mod versus_screen;
mod database;
mod generated_moderation_terms;
mod match_formats;
mod moderation;
mod reporting_routes;
mod runtime;
mod secrets;
mod state;
mod startgg;
mod startgg_queries;
#[cfg(not(debug_assertions))]
mod web_assets;

use runtime::RuntimeState;
use std::{
    io::Write,
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

/// Display-only absolute paths of the user-managed media catalogs. Packaged
/// builds keep these inside JABS's application-data directory, which is not
/// discoverable on its own; the operator surface shows these paths so users
/// know where character art, player photos, sponsor logos, and tournament
/// logos belong. The
/// renderer may display them but can never submit paths back: every catalog
/// read still resolves through RuntimeState.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaDirectories {
    game_assets: String,
    players: String,
    sponsors: String,
    tourney_logos: String,
    moderation_allowlist: String,
}

#[tauri::command]
fn get_media_directories(state: tauri::State<'_, Arc<RuntimeState>>) -> MediaDirectories {
    MediaDirectories {
        game_assets: state.game_asset_directory.display().to_string(),
        players: state.player_photo_directory.display().to_string(),
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
fn open_moderation_allowlist(
    state: tauri::State<'_, Arc<RuntimeState>>,
) -> Result<(), String> {
    moderation::ensure_runtime_allowlist_file(&state.moderation_allowlist_path)?;
    open_with_default_app(&state.moderation_allowlist_path)
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
    state: tauri::State<'_, Arc<RuntimeState>>,
) -> Result<(), String> {
    let directory = match kind.as_str() {
        "game-assets" => &state.game_asset_directory,
        "players" => &state.player_photo_directory,
        "sponsors" => &state.sponsor_directory,
        "tourney-logos" => &state.logo_directory,
        _ => return Err("Unknown media directory.".to_owned()),
    };
    std::fs::create_dir_all(directory)
        .map_err(|_| "JABS could not prepare the media folder.".to_owned())?;
    open_in_file_manager(directory)
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

#[cfg(target_os = "windows")]
fn open_with_default_app(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|_| "JABS could not open the moderation allowlist.".to_owned())
}

#[cfg(target_os = "macos")]
fn open_with_default_app(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|_| "JABS could not open the moderation allowlist.".to_owned())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_with_default_app(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|_| "JABS could not open the moderation allowlist.".to_owned())
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

#[tauri::command]
fn report_renderer_diagnostic(event: String, app: tauri::AppHandle) -> Result<(), String> {
    const ALLOWED: &[&str] = &[
        "stream-save:renderer-start",
        "stream-save:renderer-complete",
        "stream-save:renderer-failed",
        "local-request:retry",
        "local-request:failed",
    ];
    if !ALLOWED.contains(&event.as_str()) {
        return Err("Unknown renderer diagnostic event.".to_owned());
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("jabs-main.log");
    let mut options = std::fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|error| error.to_string())?;
    let timestamp = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{timestamp} {event}").map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let database_path = migrated_database_path(&app_data_dir)?;
            let database = database::Database::open(&database_path)
                .map_err(std::io::Error::other)?;
            let packaged_logo_directory = app.path().resource_dir()?.join("tourney-logos");
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
            // All user-media catalogs follow the same convention: app-data in
            // packaged builds, repository root in development. The bundled
            // reviewed logo catalog is seeded into the user-writable location
            // so installed builds keep the shipped logos and operators can add
            // their own without modifying the installation.
            let logo_directory = if cfg!(debug_assertions) {
                development_root.join("tourney-logos")
            } else {
                let user_logo_directory = app_data_dir.join("tourney-logos");
                seed_logo_directory(&packaged_logo_directory, &user_logo_directory);
                user_logo_directory
            };
            std::fs::create_dir_all(&logo_directory)?;
            std::fs::create_dir_all(&sponsor_directory)?;
            std::fs::create_dir_all(&player_photo_directory)?;
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
                eprintln!("JABS could not load the moderation allowlist: {error}");
            }
            let runtime = Arc::new(RuntimeState::new(
                database,
                logo_directory,
                sponsor_directory,
                player_photo_directory,
                game_asset_directory,
                custom_scoreboard_directory,
                moderation_allowlist_path,
            ).map_err(std::io::Error::other)?);
            secrets::initialize(&runtime);
            let requested_port = runtime::requested_port()?;
            let (listener, port) = local_server::bind_loopback(requested_port)?;
            runtime.api_port.store(port, Ordering::Release);
            app.manage(runtime.clone());

            tauri::async_runtime::spawn(async move {
                if let Err(error) = local_server::serve(listener, port, runtime).await {
                    eprintln!("JABS local service stopped: {error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_api_port,
            get_token_status,
            set_startgg_token,
            set_session_startgg_token,
            clear_startgg_token,
            get_media_directories,
            open_media_directory,
            open_moderation_allowlist,
            reload_moderation_allowlist,
            report_renderer_diagnostic
        ])
        .run(tauri::generate_context!())
        .expect("failed to run JABS");
}

/// Copies the bundled reviewed tournament-logo catalog into the user-writable
/// logo directory. Seeding is per-file and skips existing files, so a first
/// launch populates an empty directory and later app updates can add newly
/// reviewed logos without touching operator-provided files. Failures are
/// reported to stderr and never block startup.
fn seed_logo_directory(source: &std::path::Path, target: &std::path::Path) {
    if !source.is_dir() {
        return;
    }
    let mut pending = vec![(source.to_path_buf(), target.to_path_buf())];
    while let Some((from, into)) = pending.pop() {
        if let Err(error) = std::fs::create_dir_all(&into) {
            eprintln!("JABS could not prepare {}: {error}", into.display());
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&from) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let destination = into.join(entry.file_name());
            if path.is_dir() {
                pending.push((path, destination));
            } else if !destination.exists() {
                if let Err(error) = std::fs::copy(&path, &destination) {
                    eprintln!("JABS could not copy logo asset {}: {error}", path.display());
                }
            }
        }
    }
}

fn migrated_database_path(app_data_dir: &std::path::Path) -> Result<std::path::PathBuf, std::io::Error> {
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
