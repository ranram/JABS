use axum::{
    body::{Body, Bytes},
    Json, Router,
    extract::{DefaultBodyLimit, Path as AxumPath, Query, State, WebSocketUpgrade, ws::{Message, WebSocket}},
    http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
};
use futures_util::StreamExt;
use serde::Serialize;
use serde::Deserialize;
use std::{io, net::{Ipv4Addr, SocketAddrV4, TcpListener}, sync::Arc};
use crate::{runtime::RuntimeState, secrets::{self, TokenStatus}};
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    port: u16,
    token: TokenStatus,
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
        .route("/api/health", get({
            let runtime = runtime.clone();
            move || health(port, runtime)
        }))
        .route("/api/state", get(current_state))
        .route("/api/moderation/text", post(validate_moderation_text))
        .route("/api/state/selected-set", put(update_selected_set).delete(clear_selected_set))
        .route("/api/state/score", post(set_score))
        .route("/api/state/scores/reset", post(reset_scores))
        .route("/api/state/players/swap", post(swap_players))
        .route("/api/broadcast/commentators", get(commentator_state).put(update_commentator_state))
        .route("/api/broadcast/result-screen", get(result_screen_state).put(update_result_screen_state))
        .route("/api/broadcast/versus-screen", get(versus_screen_state).put(update_versus_screen_state))
        .route("/api/broadcast/top-eight-matchups", get(top_eight_matchups_state).put(update_top_eight_matchups_state))
        .route("/api/broadcast/versus-screen/history", post(refresh_versus_history))
        .route("/api/assets/logos", get(logos))
        .route("/api/assets/catalog-summary", get(asset_catalog_summary))
        .route("/assets/tournament-logos/{asset_id}", get(logo_asset))
        .route("/api/assets/player-media", get(player_media))
        .route("/api/assets/identity-media", post(identity_media))
        .route("/assets/sponsor-logos/{asset_id}", get(sponsor_logo_asset))
        .route("/assets/player-photos/{asset_id}", get(player_photo_asset))
        .route("/api/assets/game-characters", get(game_character_assets))
        .route("/assets/game-characters/{game_id}/{asset_id}", get(game_character_asset))
        .route("/assets/game-character-portraits/{game_id}/{asset_id}", get(game_character_portrait))
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
        .route("/api/locations/countries", get(countries))
        .route("/api/locations/states", get(states))
        .route("/api/startgg/events", get(startgg_events))
        .route("/api/startgg/recent-tournaments", get(recent_tournaments))
        .route("/api/startgg/cache", delete(clear_startgg_cache))
        .route("/api/startgg/stream-queue", get(startgg_stream_queue))
        .route("/api/startgg/phases", get(startgg_phases))
        .route("/api/startgg/event-standings", get(startgg_event_standings))
        .route("/api/startgg/phase-groups", get(startgg_phase_groups))
        .route("/api/startgg/sets", get(startgg_sets))
        .route("/api/startgg/inspect-set", post(inspect_startgg_set))
        .route("/api/startgg/select-set", post(select_startgg_set))
        .merge(crate::reporting_routes::router())
        .route("/ws", get(websocket))
        .fallback(web_or_not_found)
        .with_state(runtime)
        .layer(cors);
    axum::serve(listener, app).await
}

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
    match runtime.top_eight_matchups.replace(&runtime.database, body) {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "error": error })))),
    }
}

async fn update_versus_screen_state(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<crate::versus_screen::VersusScreenState>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    match runtime.versus_screen.replace(&runtime.database, body) {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "error": error })))),
    }
}

async fn refresh_versus_history(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    let selected_set = match runtime.overlay.selected_set() {
        Ok(selected_set) => selected_set,
        Err(error) => return secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    };
    match crate::startgg::versus_history(&runtime, &selected_set).await {
        Ok(history) => match runtime.versus_screen.replace_history(&runtime.database, history) {
            Ok(state) => secure_json(Json(state)),
            Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
        },
        Err(error) => startgg_error(error),
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

async fn catalog_raster_asset(
    directory: &std::path::Path,
    asset_id: &str,
    asset_label: &str,
    resolve: fn(&std::path::Path, &str) -> Option<(std::path::PathBuf, &'static str)>,
) -> Response {
    serve_resolved_raster(resolve(directory, asset_id), asset_label).await
}

async fn serve_resolved_raster(
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
    match runtime.database.clear_startgg_cache_and_history() {
        Ok(()) => secure_json(Json(serde_json::json!({ "cleared": true }))),
        Err(error) => secure_json((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": error })))),
    }
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
    Query(query): Query<EventStandingsQuery>,
) -> Response {
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
        Ok(result) => secure_json(Json(result)),
        Err(error) => startgg_error(error),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectedSetBody {
    set_id: String,
    game_id: String,
    asset_catalog_slug: Option<String>,
    event_id: Option<String>,
    tournament_slug: Option<String>,
    #[serde(default = "default_true")]
    restore_overrides: bool,
    #[serde(default = "default_true")]
    preserve_broadcast: bool,
    #[serde(default)]
    preserve_station: bool,
    #[serde(default)]
    preserve_match_length: bool,
}

fn default_true() -> bool {
    true
}

async fn inspect_startgg_set(
    State(runtime): State<Arc<RuntimeState>>,
    Json(body): Json<SelectedSetBody>,
) -> Response {
    match fetch_selected_set(&runtime, &body).await {
        Ok(Some(mut selected_set)) => {
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
    let mut fresh = match fetch_selected_set(&runtime, &body).await {
        Ok(Some(selected_set)) => selected_set,
        Ok(None) => return secure_json((StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Set not found." })))),
        Err(error) => return startgg_error(error),
    };
    reconcile_imported_characters(&mut fresh, &runtime.game_asset_directory);
    if body.restore_overrides {
        if let Some(set_id) = fresh.set_id.as_deref() {
            let saved = runtime
                .database
                .load_set_override(set_id)
                .ok()
                .flatten()
                .and_then(|payload| serde_json::from_str::<crate::state::SelectedSet>(&payload).ok())
                .map(|mut saved| {
                    crate::state::migrate_match_format(&mut saved);
                    saved
                })
                .filter(|saved| crate::state::validate_selected_set(saved).is_ok());
            if let Some(mut saved) = saved {
                saved.game_id = fresh.game_id.clone();
                saved.game_name = fresh.game_name.clone().or(saved.game_name);
                let fresh_players = [&fresh.player_one, &fresh.player_two];
                saved.player_one.player_id = fresh_players.iter()
                    .find(|player| player.entrant_id == saved.player_one.entrant_id)
                    .and_then(|player| player.player_id.clone());
                saved.player_two.player_id = fresh_players.iter()
                    .find(|player| player.entrant_id == saved.player_two.entrant_id)
                    .and_then(|player| player.player_id.clone());
                saved.set_id = fresh.set_id.clone();
                saved.phase = fresh.phase.clone();
                saved.phase_group = fresh.phase_group.clone();
                saved.winners_side_entrant_id = fresh.winners_side_entrant_id.clone();
                saved.event_id = fresh.event_id.clone().or(saved.event_id);
                saved.tournament_slug = fresh.tournament_slug.clone().or(saved.tournament_slug);
                saved.asset_catalog_slug = fresh.asset_catalog_slug.clone().or(saved.asset_catalog_slug);
                fresh = saved;
            }
        }
    }
    if body.preserve_broadcast {
        if let Ok(current) = runtime.overlay.selected_set() {
            retain_broadcast_extras(&mut fresh, &current);
        }
    }
    if body.preserve_station || body.preserve_match_length {
        if let Ok(current) = runtime.overlay.selected_set() {
            if body.preserve_station {
                fresh.station = current.station;
            }
            if body.preserve_match_length {
                fresh.match_format = current.match_format;
                fresh.best_of = current.best_of;
            }
        }
    }
    let previous_set_id = runtime.overlay.selected_set().ok()
        .and_then(|current| current.set_id);
    let selected_set_changed = previous_set_id.as_deref() != fresh.set_id.as_deref();
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
            if selected_set_changed {
                let _ = runtime.versus_screen.reset_media_placements(&runtime.database);
            }
            secure_json(Json(serde_json::json!({ "state": state, "source": "live" })))
        }
        Err(error) => state_result(Err(error)),
    }
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

async fn fetch_selected_set(
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
    let status = match error.code {
        "token-missing" | "authentication" => StatusCode::UNAUTHORIZED,
        "permission" => StatusCode::FORBIDDEN,
        "rate-limit" => StatusCode::TOO_MANY_REQUESTS,
        "invalid-response" => StatusCode::UNPROCESSABLE_ENTITY,
        _ => StatusCode::BAD_GATEWAY,
    };
    secure_json((status, Json(error)))
}

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
    match runtime.overlay.update_selected_set(
        &runtime.database,
        &runtime.logo_directory,
        &runtime.game_asset_directory,
        selected_set,
    ) {
        Ok(state) => secure_json(Json(state)),
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
    match runtime.overlay.clear_selected_set(&runtime.database) {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error })),
        )),
    }
}

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
    state_result(runtime.overlay.set_score(&runtime.database, &body.side, body.score))
}

async fn reset_scores(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    state_result(runtime.overlay.reset_scores(&runtime.database))
}

async fn swap_players(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    state_result(runtime.overlay.swap_players(&runtime.database))
}

pub(crate) fn state_result(result: Result<serde_json::Value, String>) -> Response {
    match result {
        Ok(state) => secure_json(Json(state)),
        Err(error) => secure_json((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "error": error })))),
    }
}

async fn websocket(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !trusted_websocket_origin(&headers, runtime.api_port.load(std::sync::atomic::Ordering::Acquire)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    upgrade.on_upgrade(move |socket| websocket_session(socket, runtime))
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

async fn websocket_session(mut socket: WebSocket, runtime: Arc<RuntimeState>) {
    let mut updates = runtime.overlay.subscribe();
    let mut commentator_updates = runtime.commentators.subscribe();
    let mut result_screen_updates = runtime.result_screen.subscribe();
    let mut versus_screen_updates = runtime.versus_screen.subscribe();
    let mut top_eight_matchups_updates = runtime.top_eight_matchups.subscribe();
    let Ok(initial) = runtime.overlay.current().and_then(overlay_state_message) else {
        return;
    };
    if socket.send(Message::Text(initial.into())).await.is_err() {
        return;
    }

    loop {
        tokio::select! {
            update = updates.recv() => match update {
                Ok(update) => {
                    let Ok(update) = serde_json::from_str(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(overlay_state_message)
                    else {
                        continue;
                    };
                    if socket.send(Message::Text(update.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = commentator_updates.recv() => match update {
                Ok(update) => {
                    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(commentator_state_message)
                    else { continue; };
                    if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = result_screen_updates.recv() => match update {
                Ok(update) => {
                    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(result_screen_state_message)
                    else { continue; };
                    if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = versus_screen_updates.recv() => match update {
                Ok(update) => {
                    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(versus_screen_state_message)
                    else { continue; };
                    if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = top_eight_matchups_updates.recv() => match update {
                Ok(update) => {
                    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(top_eight_matchups_state_message)
                    else { continue; };
                    if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            incoming = socket.next() => match incoming {
                Some(Ok(Message::Ping(payload))) => {
                    if socket.send(Message::Pong(payload)).await.is_err() {
                        break;
                    }
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                _ => {}
            }
        }
    }
}

fn commentator_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "commentator-state",
        "payload": state
    })).map_err(|_| "State serialization failed.".to_owned())
}

fn result_screen_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "result-screen-state",
        "payload": state
    })).map_err(|_| "State serialization failed.".to_owned())
}

fn versus_screen_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "versus-screen-state",
        "payload": state
    })).map_err(|_| "State serialization failed.".to_owned())
}

fn top_eight_matchups_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "top-eight-matchups-state",
        "payload": state
    })).map_err(|_| "State serialization failed.".to_owned())
}

fn overlay_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "overlay-state",
        "payload": state
    }))
    .map_err(|_| "State serialization failed.".to_owned())
}

async fn health(port: u16, runtime: Arc<RuntimeState>) -> impl IntoResponse {
    secure_json(Json(HealthResponse { ok: true, port, token: secrets::status(&runtime) }))
}

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
    #[cfg(debug_assertions)]
    {
        let port = _runtime.api_port.load(std::sync::atomic::Ordering::Acquire);
        let separator = if uri.query().is_some() { '&' } else { '?' };
        let location = format!("http://127.0.0.1:5173{}{}apiPort={port}", uri, separator);
        let mut response = StatusCode::TEMPORARY_REDIRECT.into_response();
        if let Ok(location) = HeaderValue::from_str(&location) {
            response.headers_mut().insert(header::LOCATION, location);
        }
        return secure_json(response);
    }
    #[cfg(not(debug_assertions))]
    {
        let asset_path = if path.is_empty() { "index.html" } else { path };
        let resolved = crate::web_assets::get(asset_path)
            .map(|contents| (asset_path, contents))
            .or_else(|| (!asset_path.contains('.')).then(|| {
                crate::web_assets::get("index.html").map(|contents| ("index.html", contents))
            }).flatten());
        let Some((asset_path, contents)) = resolved else {
            return secure_json((
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Web asset not found." })),
            ));
        };
        if contents.is_empty() {
            return secure_json((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "error": "JABS web assets are unavailable." })),
            ));
        }
        let mut response = Response::new(Body::from(contents));
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static(crate::web_assets::mime_type(asset_path)),
        );
        response.headers_mut().insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(
                "default-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://127.0.0.1:*"
            ),
        );
        secure_json(response)
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

#[cfg(test)]
mod tests {
    use super::{has_renderer_action_header, retain_broadcast_extras, trusted_websocket_origin};
    use axum::http::{HeaderMap, HeaderValue, header};

    #[test]
    fn local_requests_require_exact_origin_and_mutation_headers() {
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
}
