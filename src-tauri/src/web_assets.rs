include!(concat!(env!("OUT_DIR"), "/web_assets.rs"));

pub fn get(path: &str) -> Option<&'static [u8]> {
    WEB_ASSETS.iter()
        .find(|(asset_path, _)| *asset_path == path)
        .map(|(_, contents)| *contents)
}

pub fn mime_type(path: &str) -> &'static str {
    match path.rsplit_once('.').map(|(_, extension)| extension) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}
