use tauri::Manager;

// Only this public verification key is embedded. The signing key stays in release CI.
const PUBLIC_KEY: Option<&str> = option_env!("JABS_UPDATER_PUBLIC_KEY");

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSupport {
    version: String,
    availability: &'static str,
}

pub fn register(app: &tauri::App) -> tauri::Result<()> {
    if let Some(key) = PUBLIC_KEY.filter(|key| !key.trim().is_empty()) {
        app.handle().plugin(tauri_plugin_updater::Builder::new().pubkey(key.trim()).build())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_update_support(app: tauri::AppHandle) -> UpdateSupport {
    let availability = if cfg!(debug_assertions) {
        "development"
    } else if PUBLIC_KEY.is_none_or(|key| key.trim().is_empty()) {
        "unconfigured"
    } else if requires_package_manager(&app) {
        "package-manager"
    } else {
        "available"
    };
    UpdateSupport { version: app.package_info().version.to_string(), availability }
}

fn requires_package_manager(app: &tauri::AppHandle) -> bool {
    #[cfg(target_os = "linux")]
    { app.env().appimage.is_none() }
    #[cfg(not(target_os = "linux"))]
    { let _ = app; false }
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}
