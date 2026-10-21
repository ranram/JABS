use super::{Area, Context, Entry, Event, Reason, SUPPORT_EMAIL};
use serde::Deserialize;
use std::{
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::PathBuf,
};

pub(super) const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const FILES: [&str; 3] = ["jabs.log", "jabs.1.log", "jabs.2.log"];

// Export only recognized log fields; ignore extra text in edited or damaged files.
#[derive(Deserialize)]
struct StoredEntry {
    timestamp: String,
    session: String,
    version: String,
    event: Event,
    area: Area,
    reason: Option<Reason>,
    status: Option<u16>,
    line: Option<u32>,
    column: Option<u32>,
    count: usize,
}

impl StoredEntry {
    fn reviewed(self) -> Option<Entry> {
        let context = Context {
            area: self.area,
            reason: self.reason,
            status: self.status,
            line: self.line,
            column: self.column,
        };
        if !context.is_valid()
            || self.timestamp.len() > 64
            || self.session.len() > 64
            || self.version.len() > 32
            || self.version.split('.').count() != 3
            || self
                .version
                .split('.')
                .any(|part| part.parse::<u32>().is_err())
            || self.session.is_empty()
            || !self
                .session
                .bytes()
                .all(|b| b.is_ascii_hexdigit() || b == b'-')
            || time::OffsetDateTime::parse(
                &self.timestamp,
                &time::format_description::well_known::Rfc3339,
            )
            .is_err()
        {
            return None;
        }
        Some(Entry {
            timestamp: self.timestamp,
            session: self.session,
            version: self.version,
            level: self.event.level(),
            event: self.event,
            context,
            count: self.count,
        })
    }
}

pub(super) struct LogStorage {
    pub directory: PathBuf,
    pub unfinished: bool,
    pub write_failed: bool,
    session: String,
    previous: Option<(Event, Context)>,
    repeats: usize,
}

fn private_file(path: &std::path::Path, append: bool) -> io::Result<fs::File> {
    let mut options = OpenOptions::new();
    options
        .create(true)
        .write(true)
        .append(append)
        .truncate(!append);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

impl LogStorage {
    pub fn open(directory: PathBuf) -> io::Result<Self> {
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&directory)?;
        let unfinished = directory.join("session-active").exists();
        private_file(&directory.join("session-active"), false)?
            .write_all(b"JABS session active\n")?;
        let session = format!(
            "{:x}-{:x}",
            time::OffsetDateTime::now_utc().unix_timestamp_nanos(),
            std::process::id()
        );
        Ok(Self {
            directory,
            unfinished,
            write_failed: false,
            session,
            previous: None,
            repeats: 0,
        })
    }

    pub fn record(&mut self, event: Event, context: Context) -> io::Result<()> {
        if self.previous == Some((event, context)) {
            self.repeats = self.repeats.saturating_add(1);
            return Ok(());
        }
        self.flush_repeats()?;
        self.previous = Some((event, context));
        self.write(event, context, 1)
    }

    pub fn flush_repeats(&mut self) -> io::Result<()> {
        let repeats = std::mem::take(&mut self.repeats);
        if let Some((event, context)) = self.previous {
            if repeats > 0 {
                self.write(event, context, repeats)?;
            }
        }
        self.previous = None;
        Ok(())
    }

    pub fn write(&mut self, event: Event, context: Context, count: usize) -> io::Result<()> {
        let entry = Entry {
            timestamp: crate::database::now_rfc3339().map_err(io::Error::other)?,
            session: self.session.clone(),
            version: env!("CARGO_PKG_VERSION").into(),
            level: event.level(),
            event,
            context,
            count,
        };
        let mut bytes = serde_json::to_vec(&entry).map_err(io::Error::other)?;
        bytes.push(b'\n');
        let current = self.directory.join(FILES[0]);
        if fs::metadata(&current).map(|m| m.len()).unwrap_or(0) + bytes.len() as u64
            > MAX_FILE_BYTES
        {
            let oldest = self.directory.join(FILES[2]);
            if oldest.exists() {
                fs::remove_file(oldest)?;
            }
            for index in (0..2).rev() {
                let from = self.directory.join(FILES[index]);
                if from.exists() {
                    fs::rename(from, self.directory.join(FILES[index + 1]))?;
                }
            }
        }
        private_file(&current, true)?.write_all(&bytes)
    }

    pub fn report(&self) -> io::Result<String> {
        let mut report = format!(
            "JABS diagnostic report\nVersion: {}\nSystem: {} / {}\nSupport: {SUPPORT_EMAIL}\n\nLogs contain event codes and technical metadata. No player text, tokens, or saved state is included.\n\n",
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            std::env::consts::ARCH,
        );
        if self.write_failed {
            report.push_str("Warning: some diagnostic events could not be written to disk.\n\n");
        }
        for name in FILES.iter().rev() {
            let path = self.directory.join(name);
            let mut file = match fs::File::open(path) {
                Ok(file) => file,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            };
            report.push_str(&format!("--- {name} ---\n"));
            // Limit each file read and copy only recognized log fields into the report.
            let mut bytes = Vec::new();
            Read::by_ref(&mut file)
                .take(MAX_FILE_BYTES)
                .read_to_end(&mut bytes)?;
            let mut omitted = false;
            for line in String::from_utf8_lossy(&bytes).lines() {
                let reviewed = serde_json::from_str::<StoredEntry>(line)
                    .ok()
                    .and_then(StoredEntry::reviewed);
                if let Some(entry) = reviewed {
                    report.push_str(&serde_json::to_string(&entry).map_err(io::Error::other)?);
                    report.push('\n');
                } else {
                    omitted = true;
                }
            }
            if omitted {
                report.push_str("Unreadable log entries were omitted.\n");
            }
            report.push('\n');
        }
        Ok(report)
    }
}
