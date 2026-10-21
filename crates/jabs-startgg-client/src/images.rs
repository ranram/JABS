use crate::{ApiError, StartggClient, api_error};

const MAX_IMAGE_BYTES: usize = 2 * 1024 * 1024;

// Fetch only tournament images hosted by start.gg; do not follow redirects or send API tokens.
pub fn is_tournament_image_url(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.username().is_empty()
            && url.password().is_none()
            && url.port().is_none()
            && url.fragment().is_none()
            && matches!(url.host_str(), Some("images.start.gg" | "images.smash.gg"))
            && url.path().starts_with("/images/")
    })
}

impl StartggClient {
    pub async fn tournament_image(&self, url: &str) -> Result<(String, Vec<u8>), ApiError> {
        let invalid = || api_error("The tournament logo could not be loaded.", "invalid-image");
        if !is_tournament_image_url(url) {
            return Err(invalid());
        }
        // CDN images have their own host and must not consume the GraphQL budget
        // or delay a score report while several placement logos are loading.
        let mut response = self.client.get(url).send().await.map_err(|_| invalid())?;
        if !response.status().is_success() {
            return Err(invalid());
        }
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .to_owned();
        if !matches!(mime.as_str(), "image/png" | "image/jpeg" | "image/webp")
            || response
                .content_length()
                .is_some_and(|size| size > MAX_IMAGE_BYTES as u64)
        {
            return Err(invalid());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| invalid())? {
            if bytes.len() + chunk.len() > MAX_IMAGE_BYTES {
                return Err(invalid());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok((mime, bytes))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn logo_proxy_only_accepts_the_official_https_image_hosts() {
        assert!(is_tournament_image_url(
            "https://images.start.gg/images/image-a.png?width=256"
        ));
        assert!(is_tournament_image_url(
            "https://images.smash.gg/images/image-a.png"
        ));
        for url in [
            "http://images.start.gg/images/a.png",
            "https://127.0.0.1/images/a.png",
            "https://images.start.gg.evil.com/images/a.png",
            "https://user@images.start.gg/images/a.png",
            "https://images.start.gg:1234/images/a.png",
            "https://images.start.gg/api/a",
            "file:///images/a.png",
        ] {
            assert!(!is_tournament_image_url(url), "{url}");
        }
    }
}
