use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
    time::SystemTime,
};

type Snapshot = BTreeMap<PathBuf, (u64, SystemTime)>;

pub struct AssetChangeTracker {
    roots: Vec<PathBuf>,
    previous: Mutex<Option<Snapshot>>,
}

impl AssetChangeTracker {
    pub fn new(mut roots: Vec<PathBuf>) -> Self {
        roots.sort();
        roots.dedup();
        let previous = snapshot(&roots).ok();
        Self {
            roots,
            previous: Mutex::new(previous),
        }
    }

    pub fn changed(&self) -> Result<bool, String> {
        let mut previous = self.previous.lock().map_err(|error| error.to_string())?;
        let current = snapshot(&self.roots).map_err(|error| error.to_string())?;
        let changed = previous.as_ref() != Some(&current);
        *previous = Some(current);
        Ok(changed)
    }
}

fn snapshot(roots: &[PathBuf]) -> io::Result<Snapshot> {
    let mut files = BTreeMap::new();
    for root in roots {
        scan(root, &mut files)?;
    }
    Ok(files)
}

fn scan(directory: &Path, files: &mut Snapshot) -> io::Result<()> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            scan(&path, files)?;
        } else if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "png" | "jpg" | "jpeg" | "webp"
                )
            })
        {
            let metadata = match path.metadata() {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            };
            if metadata.is_file() {
                files.insert(path, (metadata.len(), metadata.modified()?));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let path = std::env::temp_dir().join(format!(
                "jabs-asset-changes-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn detects_added_replaced_renamed_and_removed_images_without_reading_their_contents() {
        let directory = TestDirectory::new();
        let tracker = AssetChangeTracker::new(vec![directory.0.clone(), directory.0.clone()]);
        assert!(!tracker.changed().unwrap());
        fs::write(directory.0.join("notes.txt"), "ignored").unwrap();
        assert!(!tracker.changed().unwrap());
        let nested = directory.0.join("characters");
        fs::create_dir(&nested).unwrap();
        let image = nested.join("Ryu.PNG");
        fs::write(&image, "first").unwrap();
        assert!(tracker.changed().unwrap());
        assert!(!tracker.changed().unwrap());
        fs::write(&image, "other").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&image)
            .unwrap()
            .set_modified(SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(946_684_800))
            .unwrap();
        assert!(tracker.changed().unwrap());
        fs::write(&image, "replacement").unwrap();
        assert!(tracker.changed().unwrap());
        let renamed = nested.join("Ken.png");
        fs::rename(image, &renamed).unwrap();
        assert!(tracker.changed().unwrap());
        fs::remove_file(renamed).unwrap();
        assert!(tracker.changed().unwrap());
        assert!(!tracker.changed().unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn ignores_directory_symlink_cycles_and_detects_linked_image_changes() {
        let directory = TestDirectory::new();
        let image = directory.0.join("original.png");
        fs::write(&image, "first").unwrap();
        std::os::unix::fs::symlink(&directory.0, directory.0.join("cycle")).unwrap();
        std::os::unix::fs::symlink(&image, directory.0.join("linked.png")).unwrap();
        let tracker = AssetChangeTracker::new(vec![directory.0.clone()]);
        assert!(!tracker.changed().unwrap());
        fs::write(image, "replacement").unwrap();
        assert!(tracker.changed().unwrap());
        fs::remove_file(directory.0.join("original.png")).unwrap();
        assert!(tracker.changed().unwrap());
        assert!(!tracker.changed().unwrap());
    }
}
