use super::{Context, Event, LOGGER, flush, record};
use axum::{
    Json,
    http::{HeaderMap, StatusCode},
    response::Response,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RendererReport {
    event: Event,
    context: Option<Context>,
}

pub(crate) async fn overlay_diagnostic(
    headers: HeaderMap,
    Json(report): Json<RendererReport>,
) -> Response {
    if let Some(response) = crate::local_server::reject_untrusted_mutation(&headers) {
        return response;
    }
    match report_renderer_diagnostic(report.event, report.context) {
        Ok(()) => crate::local_server::secure_json(StatusCode::NO_CONTENT),
        Err(_) => crate::local_server::secure_json(StatusCode::BAD_REQUEST),
    }
}

#[tauri::command]
pub fn report_renderer_diagnostic(event: Event, context: Option<Context>) -> Result<(), String> {
    if !event.renderer_allowed() {
        return Err("Unknown renderer diagnostic event.".into());
    }
    let context = context.unwrap_or_default();
    if !context.is_valid() {
        return Err("Unknown renderer diagnostic event.".into());
    }
    record(event, context);
    Ok(())
}

#[tauri::command]
pub async fn diagnostic_report() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        flush()?;
        let logger = LOGGER.get().ok_or("JABS diagnostics are unavailable.")?;
        logger
            .storage
            .lock()
            .map_err(|_| "JABS diagnostics are unavailable.")?
            .report()
            .map_err(|_| "JABS could not prepare the diagnostic report.".to_owned())
    })
    .await
    .map_err(|_| "JABS could not prepare the diagnostic report.".to_owned())?
}

#[tauri::command]
pub async fn open_logs_directory() -> Result<(), String> {
    let directory = LOGGER
        .get()
        .ok_or("JABS diagnostics are unavailable.")?
        .storage
        .lock()
        .map_err(|_| "JABS diagnostics are unavailable.")?
        .directory
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::open_in_file_manager(&directory)
            .map_err(|_| "JABS could not open the logs folder.".to_owned())
    })
    .await
    .map_err(|_| "JABS could not open the logs folder.".to_owned())?
}

#[tauri::command]
pub async fn open_support_email() -> Result<(), String> {
    let url = format!(
        "mailto:{}?subject=JABS%20{}%20support",
        super::SUPPORT_EMAIL,
        env!("CARGO_PKG_VERSION")
    );
    crate::external_links::open_system_url(&url)
        .await
        .map_err(|_| "JABS could not open your email app. Contact akatsatech@gmail.com.".to_owned())
}
