use std::path::{Component, Path, PathBuf};

pub fn prepare(root: &Path, subpath: Option<&str>) -> Result<PathBuf, String> {
    let subpath = subpath.unwrap_or("");
    if subpath.contains('\\')
        || Path::new(subpath)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Invalid media subfolder.".into());
    }
    std::fs::create_dir_all(root).map_err(|_| "JABS could not prepare the media folder.")?;
    let root = root
        .canonicalize()
        .map_err(|_| "JABS could not locate the media folder.")?;
    let directory = root.join(subpath);
    let existing = directory
        .ancestors()
        .find(|path| path.exists())
        .unwrap_or(&root);
    if !existing
        .canonicalize()
        .map_err(|_| "JABS could not locate the media folder.")?
        .starts_with(&root)
    {
        return Err("Invalid media subfolder.".into());
    }
    std::fs::create_dir_all(&directory).map_err(|_| "JABS could not prepare the media folder.")?;
    Ok(directory)
}

#[cfg(test)]
mod tests {
    #[test]
    fn media_subfolders_stay_inside_the_native_catalog() {
        let root = std::env::temp_dir().join(format!(
            "jabs-media-{}-{}",
            std::process::id(),
            time::OffsetDateTime::now_utc().unix_timestamp_nanos()
        ));
        let art = super::prepare(&root, Some("street-fighter-6/characters")).unwrap();
        assert!(art.is_dir());
        for path in [
            "../outside",
            "/tmp",
            "game/../../outside",
            "game\\..\\outside",
        ] {
            assert!(super::prepare(&root, Some(path)).is_err());
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.parent().unwrap(), root.join("escape")).unwrap();
            assert!(super::prepare(&root, Some("escape/outside")).is_err());
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
