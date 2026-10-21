const OPEN_FAILED: &str = "JABS could not open the link in your browser.";
const DEVELOPMENT_SUPPORT_URL: &str = "https://ko-fi.com/ranram";

fn validated_url(value: &str) -> Result<tauri::Url, String> {
    let invalid = || "JABS cannot open this external link.".to_owned();
    if value.len() > 2048 || value.chars().any(char::is_control) {
        return Err(invalid());
    }
    let url = tauri::Url::parse(value).map_err(|_| invalid())?;
    if url.scheme() != "https"
        || !(matches!(
            url.host_str(),
            Some("start.gg" | "www.start.gg" | "developer.start.gg")
        ) || url.as_str() == DEVELOPMENT_SUPPORT_URL)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err(invalid());
    }
    Ok(url)
}

/// Opens public start.gg pages and the configured development-support link.
#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    let url = validated_url(&url)?;
    open_system_url(url.as_str()).await
}

pub(crate) async fn open_system_url(url: &str) -> Result<(), String> {
    let url = url.to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        let program = "explorer";
        #[cfg(target_os = "macos")]
        let program = "open";
        #[cfg(all(unix, not(target_os = "macos")))]
        let program = "xdg-open";

        let status = std::process::Command::new(program)
            .arg(&url)
            .status()
            .map_err(|_| OPEN_FAILED.to_owned())?;
        // Explorer also returns non-zero exit codes for successful handoffs.
        if cfg!(target_os = "windows") || status.success() {
            Ok(())
        } else {
            Err(OPEN_FAILED.to_owned())
        }
    })
    .await
    .map_err(|_| OPEN_FAILED.to_owned())?
}

#[cfg(test)]
mod tests {
    #[test]
    fn external_links_allow_public_startgg_pages_and_the_exact_support_link() {
        for url in [
            "https://developer.start.gg/docs/authentication/",
            "https://www.start.gg/user/a1b2c3d4",
            "https://start.gg/tournament/weekly?tab=events#brackets",
            "https://ko-fi.com/ranram",
        ] {
            assert!(super::validated_url(url).is_ok(), "{url}");
        }
        for url in [
            "http://start.gg/user/a1b2c3d4",
            "file:///tmp/test",
            "javascript:alert(1)",
            "https://start.gg.evil.test/",
            "https://evil.test/start.gg",
            "https://start.gg@evil.test/",
            "https://user:secret@start.gg/",
            "https://start.gg:9000/",
            "https://127.0.0.1/",
            "https://start.gg/\n",
            "http://ko-fi.com/ranram",
            "https://ko-fi.com/another-account",
            "https://ko-fi.com/ranram?redirect=elsewhere",
            "https://ko-fi.com/ranram#other",
            "https://ko-fi.com.evil.test/ranram",
            "https://user:secret@ko-fi.com/ranram",
            "--help",
        ] {
            assert!(super::validated_url(url).is_err(), "{url}");
        }
        assert!(super::validated_url(&format!("https://start.gg/{}", "a".repeat(2048))).is_err());
    }
}
