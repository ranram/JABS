use super::secure_json;
use axum::{
    body::Body,
    http::{header, HeaderValue, StatusCode},
    response::Response,
    Json,
};

pub(super) fn bundled_response(path: &str) -> Response {
    let asset_path = if path.is_empty() { "index.html" } else { path };
    let resolved = crate::web_assets::get(asset_path)
        .map(|contents| (asset_path, contents))
        .or_else(|| {
            (!path.starts_with("assets/") && !path.contains('.'))
                .then(|| {
                    crate::web_assets::get("index.html").map(|contents| ("index.html", contents))
                })
                .flatten()
        });
    match resolved {
        Some((asset_path, contents)) => asset_response(asset_path, contents),
        None => secure_json((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "Web asset not found."
            })),
        )),
    }
}

fn asset_response(path: &str, contents: &'static [u8]) -> Response {
    if contents.is_empty() {
        return secure_json((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "JABS web assets are unavailable."
            })),
        ));
    }
    let mut response = Response::new(Body::from(contents));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(crate::web_assets::mime_type(path)),
    );
    response.headers_mut().insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static(
        "default-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://127.0.0.1:*"
    ));
    secure_json(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{database::Database, runtime::RuntimeState};
    use axum::{extract::State, http::Uri};
    use std::{
        path::{Path, PathBuf},
        sync::Arc,
    };

    #[tokio::test]
    async fn missing_packaged_assets_do_not_redirect_to_dev_html() {
        let unused = PathBuf::from("/jabs-no-test-assets");
        let runtime = Arc::new(
            RuntimeState::new(
                Database::open(Path::new(":memory:")).unwrap(),
                unused.clone(),
                unused.clone(),
                unused.clone(),
                unused.clone(),
                unused.clone(),
                unused,
            )
            .unwrap(),
        );
        for path in [
            "/assets/missing-stinger-script.js",
            "/assets/missing-stinger-style.css",
            "/assets/missing-font.ttf",
            "/assets/missing",
        ] {
            let response =
                super::super::web_or_not_found(State(runtime.clone()), Uri::from_static(path))
                    .await;
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{path}");
            assert!(!response.headers().contains_key(header::LOCATION));
            assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
        }
    }

    #[tokio::test]
    async fn font_assets_keep_their_binary_body_and_font_content_type() {
        let response = asset_response("assets/Anton-Regular.ttf", b"\0\x01\0\0font");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "font/ttf");
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        let bytes = axum::body::to_bytes(response.into_body(), 100)
            .await
            .unwrap();
        assert_eq!(&bytes[..], b"\0\x01\0\0font");
    }
}
