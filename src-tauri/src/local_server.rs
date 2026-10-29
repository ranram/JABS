mod realtime;
mod assets;
mod selection;
mod web;
#[cfg(debug_assertions)]
mod dev_web;
use axum::{
    body::{Body, Bytes},
    Json, Router,
    extract::{DefaultBodyLimit, Path as AxumPath, Query, State, WebSocketUpgrade},
    http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
};
use serde::Serialize;
use serde::Deserialize;
use std::{io, net::{Ipv4Addr, SocketAddrV4, TcpListener}, sync::Arc};
use crate::{runtime::RuntimeState, secrets::{self, TokenStatus}};
use tower_http::cors::CorsLayer;

// Server startup and route registration

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    port: u16,
    token: TokenStatus,
    recovery_notices: Vec<String>,
}

pub fn bind_loopback(requested_port: u16) -> io::Result<(TcpListener, u16)> {
    let listener = TcpListener::bind(loopback_address(requested_port))?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    Ok((listener, port))
}

fn loopback_address(port: u16) -> SocketAddrV4 {
    SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)
}

pub async fn serve(listener: TcpListener, port: u16, runtime: Arc<RuntimeState>) -> io::Result<()> {
    let stinger_runtime = runtime.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
        loop { interval.tick().await; stinger_runtime.stingers.expire(); }
    });
    tokio::spawn(crate::match_queue::engine::run(runtime.clone()));
    crate::versus_history::watch(runtime.clone());
    tokio::spawn(crate::bracket_screen::run_refresh(runtime.clone()));
    let listener = tokio::net::TcpListener::from_std(listener)?;
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://127.0.0.1:5173"),
            HeaderValue::from_static("http://tauri.localhost"),
            HeaderValue::from_static("tauri://localhost"),
        ])
        .allow_methods([
            Method::GET,
            Method::HEAD,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::HeaderName::from_static("x-jabs-action"),
        ])
        .allow_credentials(true);
    let app = Router::new()
        .route("/api/diagnostics/renderer", post(crate::diagnostics::commands::overlay_diagnostic)
            .layer(DefaultBodyLimit::max(1024)))
        .merge(crate::player_library::routes::router())
        .merge(crate::player_stats::router())
        .merge(crate::stingers::router())
        .merge(crate::match_queue::router())
        .merge(crate::scoreboard_photos::router())
        .route("/api/health", get({
            let runtime = runtime.clone();
            move || health(port, runtime)
        }))
        // Stream state and live scores
        .route("/api/state", get(current_state))
        .route("/api/moderation/text", post(validate_moderation_text))
        .route("/api/state/selected-set", put(update_selected_set).delete(clear_selected_set))
        .route("/api/state/exhibition-game", post(select_exhibition_game))
        .route("/api/state/score", post(set_score))
        .route("/api/state/scores/reset", post(reset_scores))
        .route("/api/state/players/swap", post(swap_players))
        .route("/api/state/players/clear", post(selection::clear_players))
        .route("/api/settings/appearance", get(crate::appearance_preferences::current).put(crate::appearance_preferences::update))
        // Broadcast layouts
        .route("/api/broadcast/commentators", get(commentator_state).put(update_commentator_state))
        .route("/api/broadcast/result-screen", get(result_screen_state).put(update_result_screen_state))
        .route("/api/broadcast/bracket-screen", get(crate::bracket_screen::current).put(crate::bracket_screen::update))
        .route("/api/broadcast/bracket-screen/refresh", post(crate::bracket_screen::refresh_route))
        .route("/api/broadcast/versus-screen", get(versus_screen_state).put(update_versus_screen_state))
        .route("/api/broadcast/top-eight-matchups", get(top_eight_matchups_state).put(update_top_eight_matchups_state))
        .route("/api/broadcast/versus-screen/history", post(refresh_versus_history))
        // Media catalogs and image files
        .route("/api/assets/logos", get(logos))
        .route("/api/assets/reload", post(assets::reload))
        .route("/api/assets/check", post(assets::check))
        .route("/api/assets/catalog-summary", get(asset_catalog_summary))
        .route("/assets/tournament-logos/{asset_id}", get(logo_asset))
        .route("/api/assets/player-media", get(player_media))
        .route("/api/assets/identity-media", post(identity_media))
        .route("/assets/sponsor-logos/{asset_id}", get(sponsor_logo_asset))
        .route("/assets/player-photos/{asset_id}", get(player_photo_asset))
        .route("/api/assets/game-characters", get(game_character_assets))
        .route("/api/assets/game-characters/prepare", post(crate::startgg_characters::prepare))
        .route("/assets/game-characters/{game_id}/{asset_id}", get(game_character_asset))
        .route("/assets/game-character-portraits/{game_id}/{asset_id}", get(game_character_portrait))
        // Custom scoreboard files and settings
        .route("/api/custom-scoreboards", get(custom_scoreboards))
        .route(
            "/api/custom-scoreboards/import",
            post(import_custom_scoreboard).layer(DefaultBodyLimit::max(
                crate::custom_scoreboards::MAX_FRAME_BYTES,
            )),
        )
        .route(
            "/api/custom-scoreboards/{scoreboard_id}",
            put(update_custom_scoreboard).delete(delete_custom_scoreboard),
        )
        .route("/assets/custom-scoreboards/{scoreboard_id}/frame", get(custom_scoreboard_frame))
        // Country and region choices
        .route("/api/locations/countries", get(countries))
        .route("/api/locations/states", get(states))
        // start.gg browsing, selection, and reporting
        .route("/api/startgg/videogames", get(startgg_videogames))
        .route("/api/startgg/events", get(startgg_events))
        .route("/api/startgg/recent-tournaments", get(recent_tournaments))
        .route("/api/startgg/cache", delete(clear_startgg_cache))
        .route("/api/startgg/stream-queue", get(startgg_stream_queue))
        .route("/api/startgg/phases", get(startgg_phases))
        .route("/api/startgg/event-standings", post(startgg_event_standings))
        .route("/api/startgg/phase-groups", get(startgg_phase_groups))
        .route("/api/startgg/sets", get(startgg_sets))
        .route("/api/startgg/inspect-set", post(inspect_startgg_set))
        .route("/api/startgg/select-set", post(select_startgg_set))
        .merge(crate::reporting_routes::router())
        // Realtime updates and application pages
        .route("/ws", get(websocket))
        .fallback(web_or_not_found)
        .with_state(runtime)
        .layer(cors)
        .layer(axum::middleware::from_fn(move |request: axum::extract::Request, next: axum::middleware::Next| async move {
            let route = request.uri().path().to_owned();
            if let Some(response) = reject_untrusted_request(request.method(), request.headers(), port) {
                crate::diagnostics::http_failure(&route, response.status().as_u16());
                return response;
            }
            let response = next.run(request).await;
            if response.status().is_client_error() || response.status().is_server_error() {
                crate::diagnostics::http_failure(&route, response.status().as_u16());
            }
            response
        }));
    axum::serve(listener, app).await
}

// Server health

async fn health(port: u16, runtime: Arc<RuntimeState>) -> impl IntoResponse {
    match runtime.database.recovery_notices() {
        Ok(recovery_notices) => secure_json(Json(HealthResponse {
            ok: true, port, token: secrets::status(&runtime), recovery_notices,
        })),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

// Stream state and live score controls

async fn current_state(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match runtime.overlay.current() {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

async fn update_selected_set(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(selected_set): Json<crate::state::SelectedSet>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let previous = runtime.overlay.selected_set().ok();
    match runtime.overlay.update_selected_set(
        &runtime.database,
        &runtime.logo_directory,
        &runtime.game_asset_directory,
        selected_set,
    ) {
        Ok(state) => {
            if let (Some(previous), Ok(next)) = (previous, serde_json::from_value::<crate::state::OverlayState>(state.clone())) {
                let _ = runtime.versus_screen.restore_media_for_match_change(
                    &runtime.database, &previous, &next.selected_set,
                    &runtime.game_asset_directory, &runtime.player_photo_directory,
                );
                runtime.stingers.score_updated(&previous, &next.selected_set);
            }
            secure_json(Json(state))
        },
        Err(crate::state::UpdateSelectedSetError::Invalid(error)) => secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": error })),
        )),
        Err(crate::state::UpdateSelectedSetError::Conflict(error)) => secure_json((
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": error })),
        )),
    }
}

async fn select_exhibition_game(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(selection): Json<crate::state::ExhibitionGameSelection>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    runtime.match_queue.interrupt(&runtime.database);
    let previous = runtime.overlay.selected_set().ok();
    match runtime
        .overlay
        .select_exhibition_game(&runtime.database, selection)
    {
        Ok(state) => {
            if let (Some(previous), Ok(next)) = (previous, serde_json::from_value::<crate::state::OverlayState>(state.clone())) {
                let _ = runtime.versus_screen.restore_media_for_match_change(
                    &runtime.database, &previous, &next.selected_set,
                    &runtime.game_asset_directory, &runtime.player_photo_directory,
                );
            }
            secure_json(Json(state))
        },
        Err(crate::state::UpdateSelectedSetError::Invalid(error)) => secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": error })),
        )),
        Err(crate::state::UpdateSelectedSetError::Conflict(error)) => secure_json((
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": error })),
        )),
    }
}

async fn clear_selected_set(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    runtime.match_queue.interrupt(&runtime.database);
    match runtime.overlay.clear_selected_set(&runtime.database) {
        Ok(state) => {
            let _ = runtime.bracket_screen.clear(&runtime.database);
            let _ = runtime.versus_screen.reset_media_placements(&runtime.database);
            secure_json(Json(state))
        },
        Err(error) => secure_json((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error })),
        )),
    }
}

#[derive(Deserialize)]
struct ScoreBody {
    side: String,
    score: u32,
}

async fn set_score(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<ScoreBody>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let previous = runtime.overlay.selected_set().ok();
    let result = runtime.overlay.set_score(&runtime.database, &body.side, body.score);
    if let (Some(previous), Ok(state)) = (previous, &result) {
        if let Ok(next) = serde_json::from_value::<crate::state::OverlayState>(state.clone()) {
            runtime.stingers.score_updated(&previous, &next.selected_set);
        }
    }
    state_result(result)
}

async fn reset_scores(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let result = runtime.overlay.reset_scores(&runtime.database);
    if result.is_ok() { runtime.stingers.reset_completion(); }
    state_result(result)
}

async fn swap_players(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let previous = runtime.overlay.selected_set().ok();
    let result = runtime.overlay.swap_players(&runtime.database);
    if let (Some(previous), Ok(state)) = (previous, &result) {
        if let Ok(next) = serde_json::from_value::<crate::state::OverlayState>(state.clone()) {
            let _ = runtime.versus_screen.restore_media_for_match_change(
                &runtime.database, &previous, &next.selected_set,
                &runtime.game_asset_directory, &runtime.player_photo_directory,
            );
        }
    }
    state_result(result)
}

// Broadcast settings and match history

async fn commentator_state(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match runtime.commentators.current() {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

async fn update_commentator_state(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<crate::commentators::CommentatorState>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    match runtime.commentators.replace(&runtime.database, &runtime.logo_directory, body) {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "error": error })))),
    }
}

async fn result_screen_state(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match runtime.result_screen.current() {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

async fn update_result_screen_state(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<crate::result_screen::ResultScreenState>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    match runtime.result_screen.replace(&runtime.database, body) {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "error": error })))),
    }
}

async fn versus_screen_state(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match runtime.versus_screen.current() {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

async fn top_eight_matchups_state(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match runtime.top_eight_matchups.current() {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

async fn update_top_eight_matchups_state(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<crate::top_eight_matchups::TopEightMatchupsState>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    broadcast_result(runtime.top_eight_matchups.replace(&runtime.database, body))
}

async fn update_versus_screen_state(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<crate::versus_screen::VersusScreenState>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    broadcast_result(runtime.versus_screen.replace(&runtime.database, body))
}

async fn refresh_versus_history(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    match crate::versus_history::refresh(runtime, true).await {
        Ok(state) => secure_json(Json(state)),
        Err(error) => startgg_error(error),
    }
}

// Media catalogs and artwork

async fn logos(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match crate::catalogs::list_logo_assets(&runtime.logo_directory) {
        Ok(logos) => secure_json(Json(serde_json::json!({ "logos": logos }))),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

async fn asset_catalog_summary(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<GameCharacterAssetsQuery>,
) -> Response {
    match crate::catalogs::asset_catalog_summary(
        &runtime.logo_directory,
        &runtime.sponsor_directory,
        &runtime.player_photo_directory,
        &runtime.game_asset_directory,
        &query.game_id,
    ) {
        Ok(summary) => secure_json(Json(summary)),
        Err(error) => secure_json((StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": error })))),
    }
}

async fn logo_asset(
    State(runtime): State<Arc<RuntimeState>>,
    AxumPath(asset_id): AxumPath<String>,
) -> Response {
    catalog_raster_asset(
        &runtime.logo_directory,
        &asset_id,
        "Logo",
        crate::catalogs::resolve_logo_path,
    ).await
}

async fn player_media(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match runtime.overlay.selected_set() {
        Ok(selected_set) => secure_json(Json(crate::catalogs::match_overlay_media(
            &runtime.sponsor_directory,
            &runtime.player_photo_directory,
            &selected_set.player_one,
            &selected_set.player_two,
        ))),
        Err(error) => secure_json((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error })),
        )),
    }
}

#[derive(Deserialize)]
struct IdentityMediaBody {
    identities: Vec<crate::catalogs::IdentityMediaInput>,
    #[serde(rename = "tournamentName")]
    tournament_name: Option<String>,
    headline: Option<String>,
}

async fn identity_media(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<IdentityMediaBody>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    if body.identities.len() > 8 || body.identities.iter().any(|identity| {
        identity.name.trim().is_empty()
            || identity.name.chars().count() > 120
            || identity.prefix.as_ref().is_some_and(|value| value.chars().count() > 120)
            || identity.sponsor.as_ref().is_some_and(|value| value.chars().count() > 120)
    }) || body.tournament_name.as_ref().is_some_and(|value| value.chars().count() > 160)
        || body.headline.as_ref().is_some_and(|value| value.chars().count() > 160)
    {
        return secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": "Provide one through eight valid player identities."
        }))));
    }
    if let Err(error) = crate::moderation::assert_safe(&[
        ("Tournament name", body.tournament_name.as_deref()),
        ("Top 8 headline", body.headline.as_deref()),
    ]) {
        return secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": error
        }))));
    }
    for identity in &body.identities {
        if let Err(error) = crate::moderation::assert_safe(&[
            ("Player name", Some(identity.name.as_str())),
            ("Player prefix", identity.prefix.as_deref()),
            ("Player sponsor", identity.sponsor.as_deref()),
        ]) {
            return secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
                "error": error
            }))));
        }
    }
    let matches = crate::catalogs::match_identity_media(
        &runtime.sponsor_directory,
        &runtime.player_photo_directory,
        &body.identities,
    );
    secure_json(Json(serde_json::json!({ "matches": matches })))
}

async fn sponsor_logo_asset(
    State(runtime): State<Arc<RuntimeState>>,
    AxumPath(asset_id): AxumPath<String>,
) -> Response {
    catalog_raster_asset(
        &runtime.sponsor_directory,
        &asset_id,
        "Sponsor logo",
        crate::catalogs::resolve_media_path,
    ).await
}

async fn player_photo_asset(
    State(runtime): State<Arc<RuntimeState>>,
    AxumPath(asset_id): AxumPath<String>,
) -> Response {
    catalog_raster_asset(
        &runtime.player_photo_directory,
        &asset_id,
        "Player photo",
        crate::catalogs::resolve_media_path,
    ).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameCharacterAssetsQuery {
    game_id: String,
}

async fn game_character_assets(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<GameCharacterAssetsQuery>,
) -> Response {
    match crate::catalogs::list_game_character_assets(&runtime.game_asset_directory, &query.game_id) {
        Ok(assets) => secure_json(Json(serde_json::json!({ "assets": assets }))),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": error
        })))),
    }
}

async fn game_character_asset(
    State(runtime): State<Arc<RuntimeState>>,
    AxumPath((game_id, asset_id)): AxumPath<(String, String)>,
) -> Response {
    let resolved = crate::catalogs::resolve_game_character_asset(
        &runtime.game_asset_directory,
        &game_id,
        &asset_id,
    );
    serve_resolved_raster(resolved, "Character artwork").await
}

async fn game_character_portrait(
    State(runtime): State<Arc<RuntimeState>>,
    AxumPath((game_id, asset_id)): AxumPath<(String, String)>,
) -> Response {
    let resolved = crate::catalogs::resolve_game_character_portrait(
        &runtime.game_asset_directory,
        &game_id,
        &asset_id,
    );
    serve_resolved_raster(resolved, "Character portrait").await
}

async fn catalog_raster_asset(
    directory: &std::path::Path,
    asset_id: &str,
    asset_label: &str,
    resolve: fn(&std::path::Path, &str) -> Option<(std::path::PathBuf, &'static str)>,
) -> Response {
    serve_resolved_raster(resolve(directory, asset_id), asset_label).await
}

pub(crate) async fn serve_resolved_raster(
    resolved: Option<(std::path::PathBuf, &'static str)>,
    asset_label: &str,
) -> Response {
    let Some((path, mime)) = resolved else {
        return secure_json((StatusCode::NOT_FOUND, Json(serde_json::json!({
            "error": format!("{asset_label} asset not found.")
        }))));
    };
    match tokio::fs::read(path).await {
        Ok(bytes) if crate::catalogs::valid_raster_bytes(&bytes, mime) => {
            let mut response = Response::new(Body::from(bytes));
            response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
            secure_json(response)
        }
        _ => secure_json((StatusCode::NOT_FOUND, Json(serde_json::json!({
            "error": format!("{asset_label} asset not found.")
        })))),
    }
}

// Custom scoreboards

#[derive(Deserialize)]
struct CustomScoreboardImportQuery {
    name: String,
}

async fn custom_scoreboards(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match crate::custom_scoreboards::list(&runtime.custom_scoreboard_directory) {
        Ok(scoreboards) => secure_json(Json(serde_json::json!({ "scoreboards": scoreboards }))),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
            "error": error
        })))),
    }
}

async fn import_custom_scoreboard(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Query(query): Query<CustomScoreboardImportQuery>,
    body: Bytes,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    match crate::custom_scoreboards::import(
        &runtime.custom_scoreboard_directory,
        &query.name,
        &body,
    ) {
        Ok(scoreboard) => secure_json((StatusCode::CREATED, Json(scoreboard))),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": error
        })))),
    }
}

async fn update_custom_scoreboard(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    AxumPath(scoreboard_id): AxumPath<String>,
    Json(scoreboard): Json<crate::custom_scoreboards::CustomScoreboard>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    if scoreboard.id != scoreboard_id {
        return secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": "The custom scoreboard ID cannot be changed."
        }))));
    }
    match crate::custom_scoreboards::save(&runtime.custom_scoreboard_directory, scoreboard.clone()) {
        Ok(()) => secure_json(Json(scoreboard)),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": error
        })))),
    }
}

async fn delete_custom_scoreboard(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    AxumPath(scoreboard_id): AxumPath<String>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    match crate::custom_scoreboards::delete(&runtime.custom_scoreboard_directory, &scoreboard_id) {
        Ok(()) => secure_json(Json(serde_json::json!({ "deleted": true }))),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": error
        })))),
    }
}

async fn custom_scoreboard_frame(
    State(runtime): State<Arc<RuntimeState>>,
    AxumPath(scoreboard_id): AxumPath<String>,
) -> Response {
    let Some(path) = crate::custom_scoreboards::frame_path(
        &runtime.custom_scoreboard_directory,
        &scoreboard_id,
    ) else {
        return secure_json((StatusCode::NOT_FOUND, Json(serde_json::json!({
            "error": "Custom scoreboard image not found."
        }))));
    };
    let Ok(bytes) = tokio::fs::read(path).await else {
        return secure_json((StatusCode::NOT_FOUND, Json(serde_json::json!({
            "error": "Custom scoreboard image not found."
        }))));
    };
    let mut response = Response::new(Body::from(bytes));
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
    secure_json(response)
}

// Country and region options

async fn countries() -> Response {
    secure_json(Json(serde_json::json!({ "countries": crate::catalogs::country_options() })))
}

#[derive(Deserialize)]
struct StatesQuery {
    country: String,
}

async fn states(Query(query): Query<StatesQuery>) -> Response {
    match crate::catalogs::state_options(&query.country) {
        Some(states) => secure_json(Json(serde_json::json!({ "states": states }))),
        None => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": "Select a valid country from the list."
        })))),
    }
}

// start.gg catalogs, bracket browsing, and cache management

async fn recent_tournaments(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match runtime.database.recent_tournaments() {
        Ok(tournaments) => secure_json(Json(serde_json::json!({ "tournaments": tournaments }))),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

async fn clear_startgg_cache(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if !has_renderer_action_header(&headers) {
        return secure_json((
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": "This local mutation requires JABS's trusted renderer." })),
        ));
    }
    runtime.player_stats.invalidate();
    match runtime.database.clear_startgg_cache_and_history() {
        Ok(()) => secure_json(Json(serde_json::json!({ "cleared": true }))),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventsQuery {
    tournament_slug: String,
}

async fn startgg_events(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<EventsQuery>,
) -> Response {
    match crate::startgg::events(&runtime, &query.tournament_slug).await {
        Ok(result) => secure_json(Json(result)),
        Err(error) => startgg_error(error),
    }
}

async fn startgg_event_standings(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Query(query): Query<EventStandingsQuery>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    let result = match (query.event_id.as_deref(), query.event_slug.as_deref()) {
        (Some(event_id), None) => crate::startgg::event_standings(&runtime, event_id).await,
        (None, Some(event_slug)) => crate::startgg::event_standings_by_slug(&runtime, event_slug).await,
        _ => Err(crate::startgg::ApiError {
            error: "Choose either the current event or a specific start.gg event URL.".to_owned(),
            code: "invalid-response",
        }),
    };
    match result {
        Ok(result) => secure_json(Json(result)),
        Err(error) => startgg_error(error),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventStandingsQuery {
    event_id: Option<String>,
    event_slug: Option<String>,
}

async fn startgg_videogames(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match crate::startgg_videogames::list(&runtime).await {
        Ok(result) => secure_json(Json(result)),
        Err(error) => startgg_error(error),
    }
}

async fn startgg_stream_queue(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<EventsQuery>,
) -> Response {
    match crate::startgg::stream_queue(&runtime, &query.tournament_slug).await {
        Ok(result) => secure_json(Json(result)),
        Err(error) => startgg_error(error),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhasesQuery {
    event_id: String,
}

async fn startgg_phases(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<PhasesQuery>,
) -> Response {
    match crate::startgg::phases(&runtime, &query.event_id).await {
        Ok(result) => secure_json(Json(result)),
        Err(error) => startgg_error(error),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhaseGroupsQuery {
    phase_id: String,
    page: u32,
    per_page: u32,
}

async fn startgg_phase_groups(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<PhaseGroupsQuery>,
) -> Response {
    match crate::startgg::phase_groups(&runtime, &query.phase_id, query.page, query.per_page).await {
        Ok(result) => secure_json(Json(result)),
        Err(error) => startgg_error(error),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetsQuery {
    scope: String,
    event_id: String,
    phase_id: Option<String>,
    phase_group_id: Option<String>,
    station_number: Option<u32>,
    page: u32,
    per_page: u32,
}

async fn startgg_sets(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<SetsQuery>,
) -> Response {
    let request = crate::startgg::SetsRequest {
        scope: &query.scope,
        event_id: &query.event_id,
        phase_id: query.phase_id.as_deref(),
        phase_group_id: query.phase_group_id.as_deref(),
        station_number: query.station_number,
        page: query.page,
        per_page: query.per_page,
    };
    match crate::startgg::sets(&runtime, request).await {
        Ok(result) => {
            if let Some(sets) = result.get("sets").and_then(|sets| sets.as_array()) {
                let observed = runtime.observe_startgg_sets(&query.event_id, sets);
                if let Err(error) = observed {
                    crate::diagnostics::record(
                        crate::diagnostics::Event::RequestFailed,
                        crate::diagnostics::Context {
                            area: crate::diagnostics::Area::Bracket,
                            operation: Some(crate::diagnostics::Operation::StartggSets),
                            method: Some(crate::diagnostics::Method::Get),
                            reason: Some(crate::diagnostics::Reason::Storage),
                            ..Default::default()
                        },
                    );
                    return state_result(Err(error));
                }
            }
            secure_json(Json(result))
        }
        Err(error) => startgg_error(error),
    }
}

// Selecting a start.gg set for the stream

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SelectedSetBody {
    pub set_id: String,
    pub game_id: String,
    pub asset_catalog_slug: Option<String>,
    pub event_id: Option<String>,
    pub tournament_slug: Option<String>,
    #[serde(default = "default_true")]
    pub restore_overrides: bool,
    #[serde(default = "default_true")]
    pub preserve_broadcast: bool,
    #[serde(default)]
    pub preserve_station: bool,
    #[serde(default)]
    pub preserve_match_length: bool,
}

fn default_true() -> bool {
    true
}

async fn inspect_startgg_set(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<SelectedSetBody>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    match fetch_selected_set(&runtime, &body).await {
        Ok(Some(mut selected_set)) => {
            if let Some(event_id) = selected_set.event_id.as_deref() {
                let summary = serde_json::json!({
                    "id": selected_set.set_id,
                    "state": selected_set.state,
                    "entrantOne": { "id": selected_set.player_one.entrant_id },
                    "entrantTwo": { "id": selected_set.player_two.entrant_id },
                });
                if let Err(error) = runtime.observe_startgg_sets(event_id, &[summary]) {
                    return state_result(Err(error));
                }
            }
            reconcile_imported_characters(&mut selected_set, &runtime.game_asset_directory);
            secure_json(Json(serde_json::json!({
                "selectedSet": selected_set,
                "source": "live"
            })))
        }
        Ok(None) => secure_json((StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Set not found." })))),
        Err(error) => startgg_error(error),
    }
}

async fn select_startgg_set(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<SelectedSetBody>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    runtime.match_queue.interrupt(&runtime.database);
    let raw = match fetch_selected_set(&runtime, &body).await {
        Ok(Some(fresh)) => fresh,
        Ok(None) => return secure_json((StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Set not found." })))),
        Err(error) => return startgg_error(error),
    };
    let mut fresh = match prepare_imported_set(&runtime, &body, raw) {
        Ok(fresh) => fresh,
        Err(error) => return state_result(Err(error)),
    };
    let previous = runtime.overlay.selected_set().ok();
    let selected_set_changed = previous.as_ref().and_then(|current| current.set_id.as_deref()) != fresh.set_id.as_deref();
    crate::state::censor_untrusted_selected_set(&mut fresh);
    if let Some(slug) = fresh.tournament_slug.as_deref() {
        if runtime.database.record_recent_tournament(slug).is_err() {
            return secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "error": "The set loaded, but tournament history could not be saved."
            }))));
        }
    }
    match runtime.overlay.replace_selected_set(
        &runtime.database,
        &runtime.logo_directory,
        &runtime.game_asset_directory,
        fresh,
    ) {
        Ok(state) => {
            if let (Some(previous), Ok(next)) = (previous, serde_json::from_value::<crate::state::OverlayState>(state.clone())) {
                let _ = runtime.versus_screen.restore_media_for_match_change(
                    &runtime.database, &previous, &next.selected_set,
                    &runtime.game_asset_directory, &runtime.player_photo_directory,
                );
            }
            // Sending the same set again can refresh an expired history entry too.
            if !selected_set_changed {
                let history_runtime = runtime.clone();
                tokio::spawn(async move {
                    let _ = crate::versus_history::refresh(history_runtime, false).await;
                });
            }
            secure_json(Json(serde_json::json!({ "state": state, "source": "live" })))
        }
        Err(error) => state_result(Err(error)),
    }
}

pub(crate) fn prepare_imported_set(runtime: &RuntimeState, body: &SelectedSetBody, mut fresh: crate::state::SelectedSet) -> Result<crate::state::SelectedSet, String> {
    let upstream_reset = runtime.match_queue.result_was_reset(&fresh)?;
    selection::apply_player_preferences(&runtime.database, &runtime.game_asset_directory, &mut fresh, body.restore_overrides, upstream_reset)?;
    let current = runtime.overlay.selected_set()?;
    if body.preserve_broadcast { retain_broadcast_extras(&mut fresh, &current); }
    if body.preserve_station { fresh.station = current.station; }
    if body.preserve_match_length && current.match_format.as_deref() == Some("best-of") {
        fresh.match_format = current.match_format; fresh.best_of = current.best_of;
    }
    Ok(fresh)
}

fn retain_broadcast_extras(
    fresh: &mut crate::state::SelectedSet,
    current: &crate::state::SelectedSet,
) {
    fresh.broadcast = current.broadcast.clone();
    fresh.custom_scoreboard_id = current.custom_scoreboard_id.clone();
    fresh.custom_scoreboard_revision = current.custom_scoreboard_revision.clone();
    if current.set_id == fresh.set_id {
        fresh.styling_game_id = current.styling_game_id.clone();
    }
}

/// start.gg character selections are useful enrichment, but they are not required to show a set
/// on stream. Keep every selection that maps to the active catalog and drop only unavailable
/// external metadata. Manually edited or restored state still passes the strict state validator.
fn reconcile_imported_characters(
    selected_set: &mut crate::state::SelectedSet,
    game_asset_directory: &std::path::Path,
) {
    let catalog_slug = selected_set
        .asset_catalog_slug
        .as_deref()
        .unwrap_or(&selected_set.game_id);
    for player in [&mut selected_set.player_one, &mut selected_set.player_two] {
        let mut characters = std::mem::take(&mut player.characters)
            .into_iter()
            .filter_map(|character| {
                crate::catalogs::canonical_character_for_catalog(
                    game_asset_directory,
                    catalog_slug,
                    &character,
                )
            })
            .collect::<Vec<_>>();
        characters.dedup();
        player.character = characters.first().cloned();
        player.characters = characters;
    }
}

pub(crate) async fn fetch_selected_set(
    runtime: &RuntimeState,
    body: &SelectedSetBody,
) -> Result<Option<crate::state::SelectedSet>, crate::startgg::ApiError> {
    crate::startgg::selected_set(runtime, crate::startgg::SelectedSetRequest {
        set_id: &body.set_id,
        game_id: &body.game_id,
        asset_catalog_slug: body.asset_catalog_slug.as_deref(),
        event_id: body.event_id.as_deref(),
        tournament_slug: body.tournament_slug.as_deref(),
    }).await
}

pub(crate) fn startgg_error(error: crate::startgg::ApiError) -> Response {
    crate::diagnostics::record(crate::diagnostics::Event::StartggFailed, crate::diagnostics::Context {
        area: crate::diagnostics::Area::Startgg,
        reason: Some(crate::diagnostics::Reason::from_code(error.code)),
        ..Default::default()
    });
    let status = match error.code {
        "token-missing" | "authentication" => StatusCode::UNAUTHORIZED,
        "permission" => StatusCode::FORBIDDEN,
        "rate-limit" => StatusCode::TOO_MANY_REQUESTS,
        "invalid-response" | "player-reference" => StatusCode::UNPROCESSABLE_ENTITY,
        "player-not-found" => StatusCode::NOT_FOUND,
        _ => StatusCode::BAD_GATEWAY,
    };
    secure_json((status, Json(error)))
}

// Text moderation

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModerationTextBody {
    field: String,
    value: String,
}

async fn validate_moderation_text(
    headers: HeaderMap,
    Json(body): Json<ModerationTextBody>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let label = match body.field.as_str() {
        "displayName" => "Display name",
        "round" => "Round",
        "station" => "Station",
        "playerOneName" => "Player one name",
        "playerOnePrefix" => "Player one prefix",
        "playerOneSponsor" => "Player one sponsor",
        "playerOnePronouns" => "Player one pronouns",
        "playerTwoName" => "Player two name",
        "playerTwoPrefix" => "Player two prefix",
        "playerTwoSponsor" => "Player two sponsor",
        "playerTwoPronouns" => "Player two pronouns",
        "infoLeft" => "Left broadcast text",
        "infoRight" => "Right broadcast text",
        "generatorTournamentName" => "Tournament name",
        "generatorHeadline" => "Generator headline",
        "generatorPlayerName" => "Player name",
        "generatorSponsor" => "Player sponsor",
        _ => return secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": "Unknown moderation field." })),
        )),
    };
    if body.value.chars().count() > 160 {
        return secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": "Moderation text is too long." })),
        ));
    }
    match crate::moderation::assert_safe(&[(label, Some(body.value.as_str()))]) {
        Ok(()) => secure_json(Json(serde_json::json!({ "safe": true }))),
        Err(error) => secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": error })),
        )),
    }
}

// Live state updates

async fn websocket(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !trusted_websocket_origin(&headers, runtime.api_port.load(std::sync::atomic::Ordering::Acquire)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    upgrade.on_upgrade(move |socket| realtime::websocket_session(socket, runtime))
}

fn trusted_websocket_origin(headers: &HeaderMap, port: u16) -> bool {
    let Some(origin) = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    origin == "http://127.0.0.1:5173"
        || origin == "http://tauri.localhost"
        || origin == "tauri://localhost"
        || origin == format!("http://127.0.0.1:{port}")
}

// Web pages and packaged assets

async fn web_or_not_found(
    State(_runtime): State<Arc<RuntimeState>>,
    uri: Uri,
) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path == "api" || path.starts_with("api/") || path == "ws" {
        return secure_json((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "Local API route not found.",
                "code": "route-not-found"
            })),
        ));
    }
    if path == "mobile" || path.starts_with("mobile/") {
        return secure_json((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "Desktop mobile control has been retired.",
                "code": "route-not-found"
            })),
        ));
    }
    // OBS can retain packaged asset URLs when the app switches to a dev build.
    if path.starts_with("assets/") {
        return web::bundled_response(path);
    }
    #[cfg(debug_assertions)]
    {
        dev_web::response(uri).await
    }
    #[cfg(not(debug_assertions))]
    {
        web::bundled_response(path)
    }
}

// Shared request guards and response helpers

fn reject_untrusted_request(method: &Method, headers: &HeaderMap, port: u16) -> Option<Response> {
    // Loopback binding alone does not stop a website from rebinding its DNS to us.
    let expected_host = format!("127.0.0.1:{port}");
    let mut hosts = headers.get_all(header::HOST).iter();
    let trusted_host = hosts.next().and_then(|value| value.to_str().ok()) == Some(expected_host.as_str())
        && hosts.next().is_none();
    if !trusted_host || (headers.contains_key(header::ORIGIN) && !trusted_websocket_origin(headers, port)) {
        return Some(secure_json((StatusCode::FORBIDDEN, Json(serde_json::json!({
            "error": "This request requires JABS's local origin."
        })))));
    }
    if !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return reject_untrusted_mutation(headers);
    }
    None
}

fn has_renderer_action_header(headers: &HeaderMap) -> bool {
    headers.get("x-jabs-action")
        .and_then(|value| value.to_str().ok())
        == Some("renderer-v1")
}

pub(crate) fn reject_untrusted_mutation(headers: &HeaderMap) -> Option<Response> {
    (!has_renderer_action_header(headers)).then(|| secure_json((
        StatusCode::FORBIDDEN,
        Json(serde_json::json!({ "error": "This local mutation requires JABS's trusted renderer." })),
    )))
}

fn broadcast_result(result: Result<serde_json::Value, String>) -> Response {
    match result {
        Err(error) if error == crate::persisted_state::STALE_SETTINGS => secure_json((
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": error, "code": "conflict" })),
        )),
        result => state_result(result),
    }
}

pub(crate) fn state_result(result: Result<serde_json::Value, String>) -> Response {
    match result {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "error": error })))),
    }
}

pub(crate) fn secure_json(response: impl IntoResponse) -> Response {
    let mut response = response.into_response();
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    response
}

// Tests

#[cfg(test)]
mod tests {
    use super::{has_renderer_action_header, reject_untrusted_request, retain_broadcast_extras, trusted_websocket_origin};
    use axum::http::{HeaderMap, HeaderValue, Method, header};

    #[tokio::test]
    async fn local_requests_require_exact_origin_and_mutation_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(header::ORIGIN, HeaderValue::from_static("http://127.0.0.1:4279"));
        assert!(trusted_websocket_origin(&headers, 4279));

        headers.insert(header::ORIGIN, HeaderValue::from_static("https://attacker.example"));
        assert!(!trusted_websocket_origin(&headers, 4279));
        assert!(!trusted_websocket_origin(&HeaderMap::new(), 4279));

        let mut mutation_headers = HeaderMap::new();
        assert!(!has_renderer_action_header(&mutation_headers));
        mutation_headers.insert("x-jabs-action", HeaderValue::from_static("renderer-v1"));
        assert!(has_renderer_action_header(&mutation_headers));
        mutation_headers.insert("x-jabs-action", HeaderValue::from_static("renderer-v2"));
        assert!(!has_renderer_action_header(&mutation_headers));

        let mut request_headers = HeaderMap::new();
        assert!(reject_untrusted_request(&Method::GET, &request_headers, 4279).is_some());
        request_headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1:4279"));
        assert!(reject_untrusted_request(&Method::GET, &request_headers, 4279).is_none());
        assert!(reject_untrusted_request(&Method::GET, &request_headers, 4280).is_some());
        assert!(reject_untrusted_request(&Method::POST, &request_headers, 4279).is_some());
        request_headers.insert("x-jabs-action", HeaderValue::from_static("renderer-v1"));
        assert!(reject_untrusted_request(&Method::POST, &request_headers, 4279).is_none());
        request_headers.insert(header::ORIGIN, HeaderValue::from_static("http://127.0.0.1:4279"));
        assert!(reject_untrusted_request(&Method::POST, &request_headers, 4279).is_none());
        request_headers.insert(header::ORIGIN, HeaderValue::from_static("https://attacker.example"));
        assert!(reject_untrusted_request(&Method::GET, &request_headers, 4279).is_some());
        request_headers.remove(header::ORIGIN);
        request_headers.insert(header::HOST, HeaderValue::from_static("attacker.example:4279"));
        assert!(reject_untrusted_request(&Method::POST, &request_headers, 4279).is_some());
        request_headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1:4279"));
        request_headers.append(header::HOST, HeaderValue::from_static("attacker.example:4279"));
        assert!(reject_untrusted_request(&Method::GET, &request_headers, 4279).is_some());

        let directory = std::path::PathBuf::from("unused");
        let runtime = std::sync::Arc::new(crate::runtime::RuntimeState::new(
            crate::database::Database::open(std::path::Path::new(":memory:")).unwrap(),
            directory.clone(), directory.clone(), directory.clone(),
            directory.clone(), directory.clone(), directory,
        ).unwrap());
        let mut assets = runtime.asset_catalog_revision.subscribe();
        let revision = *assets.borrow();
        let rejected = super::assets::reload(axum::extract::State(runtime.clone()), HeaderMap::new()).await;
        assert_eq!(rejected.status(), axum::http::StatusCode::FORBIDDEN);
        assert!(!assets.has_changed().unwrap());
        let mut reload_headers = HeaderMap::new();
        reload_headers.insert("x-jabs-action", HeaderValue::from_static("renderer-v1"));
        let rejected_check = super::assets::check(axum::extract::State(runtime.clone()), HeaderMap::new()).await;
        assert_eq!(rejected_check.status(), axum::http::StatusCode::FORBIDDEN);
        let unchanged = super::assets::check(axum::extract::State(runtime.clone()), reload_headers.clone()).await;
        assert_eq!(unchanged.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(unchanged.into_body(), 1024).await.unwrap();
        let response: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(response["changed"], false);
        assert_eq!(response["revision"], revision);
        assert!(!assets.has_changed().unwrap());
        let accepted = super::assets::reload(axum::extract::State(runtime), reload_headers).await;
        assert_eq!(accepted.status(), axum::http::StatusCode::OK);
        assets.changed().await.unwrap();
        let body = axum::body::to_bytes(accepted.into_body(), 1024).await.unwrap();
        let response: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(response["revision"], revision + 1);
        assert_eq!(*assets.borrow_and_update(), revision + 1);
    }

    #[test]
    fn a_new_set_keeps_broadcast_extras_without_reusing_game_styling() {
        let selected_set = |set_id: &str, styling: &str, info: &str| {
            serde_json::from_value::<crate::state::SelectedSet>(serde_json::json!({
                "setId": set_id,
                "displayName": "Player 1 vs Player 2",
                "gameId": "street-fighter-6",
                "stylingGameId": styling,
                "bestOf": 3,
                "broadcast": {
                    "infoBarEnabled": true,
                    "infoLeft": info,
                    "logoEnabled": true,
                    "logoAssetId": "event.png"
                },
                "playerOne": { "entrantId": "p1", "name": "Player 1", "score": 0 },
                "playerTwo": { "entrantId": "p2", "name": "Player 2", "score": 0 },
                "updatedAt": "2026-08-27T00:00:00Z"
            })).expect("selected set fixture should be valid")
        };
        let current = selected_set("old", "tekken-8", "twitch.tv/jabs");
        let mut fresh = selected_set("new", "street-fighter-6", "replacement");

        retain_broadcast_extras(&mut fresh, &current);

        assert!(fresh.broadcast == current.broadcast);
        assert_eq!(fresh.styling_game_id.as_deref(), Some("street-fighter-6"));
    }

    #[tokio::test]
    async fn versus_placement_resets_on_game_and_match_transitions_and_rejects_old_edits() {
        use crate::{database::Database, runtime::RuntimeState, state::ExhibitionGameSelection, versus_screen::VersusScreenState};
        use axum::{extract::State, Json};
        use std::{path::PathBuf, sync::Arc};

        let directory = PathBuf::from("unused");
        let runtime = Arc::new(RuntimeState::new(
            Database::open(std::path::Path::new(":memory:")).unwrap(),
            directory.clone(), directory.clone(), directory.clone(),
            directory.clone(), directory.clone(), directory,
        ).unwrap());
        let mut headers = HeaderMap::new();
        headers.insert("x-jabs-action", HeaderValue::from_static("renderer-v1"));

        fn adjust(runtime: &RuntimeState) -> VersusScreenState {
            let mut settings: VersusScreenState = serde_json::from_value(runtime.versus_screen.current().unwrap()).unwrap();
            settings.media_mode = "combined".into();
            settings.show_match_backdrop = false;
            for placement in &mut settings.media_placements {
                placement.character.scale = 2.0;
                placement.character.x = 0.3;
                placement.photo.y = 0.2;
            }
            serde_json::from_value(runtime.versus_screen.replace(&runtime.database, settings).unwrap()).unwrap()
        }
        fn assert_reset(runtime: &RuntimeState) {
            let settings: VersusScreenState = serde_json::from_value(runtime.versus_screen.current().unwrap()).unwrap();
            for placement in settings.media_placements {
                assert_eq!(placement.character, crate::versus_screen::MediaTransform::default());
                assert_eq!(placement.photo, crate::versus_screen::MediaTransform::default());
            }
            assert_eq!(settings.media_mode, "combined");
            assert!(!settings.show_match_backdrop);
        }

        let initial = runtime.overlay.selected_set().unwrap();
        let response = super::select_exhibition_game(State(runtime.clone()), headers.clone(), Json(ExhibitionGameSelection {
            game_id: "street-fighter-6".into(), game_name: "Vampire Savior The Lord of Vampire".into(),
            videogame_id: "582".into(), asset_catalog_slug: "vampire-savior-the-lord-of-vampire".into(),
            updated_at: initial.updated_at,
        })).await;
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let delayed_edit = adjust(&runtime);
        let before_score = runtime.versus_screen.current().unwrap();
        let mut exhibition = runtime.overlay.selected_set().unwrap();
        exhibition.station = Some("Station 1".into());
        let response = super::update_selected_set(State(runtime.clone()), headers.clone(), Json(exhibition)).await;
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let response = super::set_score(State(runtime.clone()), headers.clone(), Json(super::ScoreBody { side: "one".into(), score: 1 })).await;
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_eq!(runtime.versus_screen.current().unwrap(), before_score);

        let exhibition = runtime.overlay.selected_set().unwrap();
        let response = super::select_exhibition_game(State(runtime.clone()), headers.clone(), Json(ExhibitionGameSelection {
            game_id: "street-fighter-6".into(), game_name: "Street Fighter 6".into(),
            videogame_id: "43868".into(), asset_catalog_slug: "street-fighter-6".into(),
            updated_at: exhibition.updated_at,
        })).await;
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_reset(&runtime);
        assert_eq!(runtime.versus_screen.replace(&runtime.database, delayed_edit).unwrap_err(), crate::persisted_state::STALE_SETTINGS);

        adjust(&runtime);
        let mut tournament = runtime.overlay.selected_set().unwrap();
        tournament.set_id = Some("123".into());
        tournament.event_id = Some("456".into());
        let response = super::update_selected_set(State(runtime.clone()), headers.clone(), Json(tournament)).await;
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_reset(&runtime);
        adjust(&runtime);
        let response = super::clear_selected_set(State(runtime.clone()), headers).await;
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_reset(&runtime);
    }
}
