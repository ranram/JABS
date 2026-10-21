use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use std::{path::Path, sync::Mutex};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

pub struct Database {
    pub(crate) connection: Mutex<Connection>,
    recovery_notices: Mutex<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentTournament {
    slug: String,
    opened_at: String,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path)
            .map_err(|_| "Unable to open JABS's local database.".to_owned())?;
        connection.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS app_state (
               id INTEGER PRIMARY KEY CHECK (id = 1),
               payload TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS set_overrides (
               set_id TEXT PRIMARY KEY NOT NULL,
               payload TEXT NOT NULL,
               updated_at TEXT NOT NULL,
               versus_media TEXT
             );
             CREATE TABLE IF NOT EXISTS startgg_cache (
               cache_key TEXT PRIMARY KEY NOT NULL,
               payload TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS recent_tournaments (
               slug TEXT PRIMARY KEY NOT NULL,
               opened_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS broadcast_surfaces (
               surface_id TEXT PRIMARY KEY NOT NULL,
               payload TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS state_recovery (
               surface_id TEXT NOT NULL,
               payload TEXT NOT NULL,
               recovered_at TEXT NOT NULL,
               UNIQUE(surface_id, payload)
             );"
        ).map_err(|_| "Unable to initialize JABS's local database.".to_owned())?;
        let has_versus_media: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('set_overrides') WHERE name = 'versus_media')",
            [], |row| row.get(0),
        ).map_err(|_| "Unable to read saved match settings.".to_owned())?;
        if !has_versus_media {
            connection.execute("ALTER TABLE set_overrides ADD COLUMN versus_media TEXT", [])
                .map_err(|_| "Unable to prepare saved match artwork settings.".to_owned())?;
        }
        connection.execute_batch(crate::player_library::SCHEMA)
            .map_err(|_| "Unable to initialize the player library.".to_owned())?;
        prune_expired_set_overrides(&connection)?;
        Ok(Self { connection: Mutex::new(connection), recovery_notices: Mutex::new(Vec::new()) })
    }

    pub fn recovery_notices(&self) -> Result<Vec<String>, String> {
        self.recovery_notices.lock().map(|notices| notices.clone())
            .map_err(|_| "Recovery notices are unavailable.".to_owned())
    }

    pub fn record_recovery_notice(&self, message: String) -> Result<(), String> {
        crate::diagnostics::record(crate::diagnostics::Event::SettingsRecovered,
            crate::diagnostics::Context { area: crate::diagnostics::Area::Settings, ..Default::default() });
        self.recovery_notices.lock()
            .map_err(|_| "Recovery notices are unavailable.".to_owned())?.push(message);
        Ok(())
    }

    pub fn preserve_rejected_state(&self, surface: &str, payload: &str) -> Result<(), String> {
        self.connection.lock().map_err(|_| "Local database is unavailable.".to_owned())?
            .execute(
                "INSERT OR IGNORE INTO state_recovery (surface_id, payload, recovered_at) VALUES (?1, ?2, ?3)",
                params![surface, payload, now_rfc3339()?],
            ).map_err(|_| "Unable to preserve saved settings for recovery. No settings were replaced.".to_owned())?;
        self.record_recovery_notice(format!(
            "Saved {surface} settings could not be loaded. Defaults are in use; the original record is preserved in the local database for recovery."
        ))
    }

    pub fn record_recent_tournament(&self, slug: &str) -> Result<(), String> {
        let slug = slug.trim();
        if slug.is_empty() {
            return Err("Tournament slug cannot be empty.".to_owned());
        }
        let opened_at = now_rfc3339()?;
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        connection.execute(
            "INSERT INTO recent_tournaments (slug, opened_at)
             VALUES (?1, ?2)
             ON CONFLICT(slug) DO UPDATE SET opened_at = excluded.opened_at",
            params![slug, opened_at],
        ).map_err(|_| "Unable to save recent tournament history.".to_owned())?;
        connection.execute(
            "DELETE FROM recent_tournaments
             WHERE slug NOT IN (
               SELECT slug FROM recent_tournaments ORDER BY opened_at DESC LIMIT 8
             )",
            [],
        ).map_err(|_| "Unable to trim recent tournament history.".to_owned())?;
        Ok(())
    }

    pub fn load_overlay_state(&self) -> Result<Option<String>, String> {
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        let mut statement = connection.prepare("SELECT payload FROM app_state WHERE id = 1")
            .map_err(|_| "Unable to read local stream state.".to_owned())?;
        let mut rows = statement.query([])
            .map_err(|_| "Unable to read local stream state.".to_owned())?;
        match rows.next().map_err(|_| "Unable to read local stream state.".to_owned())? {
            Some(row) => row.get(0).map(Some)
                .map_err(|_| "Unable to read local stream state.".to_owned()),
            None => Ok(None),
        }
    }

    pub fn save_overlay_state(&self, payload: &str, updated_at: &str) -> Result<(), String> {
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        connection.execute(
            "INSERT INTO app_state (id, payload, updated_at)
             VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET
               payload = excluded.payload,
               updated_at = excluded.updated_at",
            params![payload, updated_at],
        ).map_err(|_| "Unable to save local stream state.".to_owned())?;
        Ok(())
    }

    pub fn load_broadcast_surface(&self, surface_id: &str) -> Result<Option<String>, String> {
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        let mut statement = connection.prepare(
            "SELECT payload FROM broadcast_surfaces WHERE surface_id = ?1"
        ).map_err(|_| "Unable to read the broadcast surface.".to_owned())?;
        let mut rows = statement.query(params![surface_id])
            .map_err(|_| "Unable to read the broadcast surface.".to_owned())?;
        match rows.next().map_err(|_| "Unable to read the broadcast surface.".to_owned())? {
            Some(row) => row.get(0).map(Some)
                .map_err(|_| "Unable to read the broadcast surface.".to_owned()),
            None => Ok(None),
        }
    }

    pub fn save_broadcast_surface(
        &self,
        surface_id: &str,
        payload: &str,
        updated_at: &str,
    ) -> Result<(), String> {
        self.save_broadcast_surface_with_media(surface_id, payload, updated_at, None, &[])
    }

    pub fn save_broadcast_surface_with_media(
        &self,
        surface_id: &str,
        payload: &str,
        updated_at: &str,
        set_media: Option<(&str, &str)>,
        player_defaults: &[crate::versus_screen::PlayerMediaDefault],
    ) -> Result<(), String> {
        let mut connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        let transaction = connection.transaction()
            .map_err(|_| "Unable to begin saving overlay settings.".to_owned())?;
        transaction.execute(
            "INSERT INTO broadcast_surfaces (surface_id, payload, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(surface_id) DO UPDATE SET
               payload = excluded.payload,
               updated_at = excluded.updated_at",
            params![surface_id, payload, updated_at],
        ).map_err(|_| "Unable to save the broadcast surface.".to_owned())?;
        if let Some((set_id, media)) = set_media {
            let saved = transaction.execute(
                "UPDATE set_overrides SET versus_media = ?1, updated_at = ?2 WHERE set_id = ?3",
                params![media, updated_at, set_id],
            ).map_err(|_| "Unable to save match artwork settings.".to_owned())?;
            if saved != 1 { return Err("The match is no longer available for saving artwork settings.".to_owned()); }
        }
        for default in player_defaults {
            transaction.execute(
                "INSERT INTO player_versus_media (player_id, context, placement)
                 SELECT ?1, ?2, ?3 WHERE EXISTS(SELECT 1 FROM players WHERE local_id = ?1)
                 ON CONFLICT(player_id, context) DO UPDATE SET placement = excluded.placement",
                params![default.player_id, default.context, default.payload],
            ).map_err(|_| "Unable to save match artwork settings.".to_owned())?;
        }
        transaction.commit().map_err(|_| "Unable to finish saving overlay settings.".to_owned())
    }

    pub fn load_player_versus_media(&self, player_id: &str, context: &str) -> Result<Option<String>, String> {
        self.connection.lock().map_err(|_| "Local database is unavailable.".to_owned())?
            .query_row(
                "SELECT placement FROM player_versus_media WHERE player_id = ?1 AND context = ?2",
                params![player_id, context], |row| row.get(0),
            ).optional().map_err(|_| "Unable to read saved match artwork settings.".to_owned())
    }

    pub fn load_set_versus_media(&self, set_id: &str) -> Result<Option<String>, String> {
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        prune_expired_set_overrides(&connection)?;
        connection.query_row(
            "SELECT versus_media FROM set_overrides WHERE set_id = ?1", [set_id],
            |row| row.get::<_, Option<String>>(0),
        ).optional().map(Option::flatten)
            .map_err(|_| "Unable to read saved match artwork settings.".to_owned())
    }

    pub fn load_set_override(&self, set_id: &str) -> Result<Option<String>, String> {
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        prune_expired_set_overrides(&connection)?;
        let mut statement = connection.prepare(
            "SELECT payload FROM set_overrides WHERE set_id = ?1"
        ).map_err(|_| "Unable to read saved set details.".to_owned())?;
        let mut rows = statement.query(params![set_id])
            .map_err(|_| "Unable to read saved set details.".to_owned())?;
        match rows.next().map_err(|_| "Unable to read saved set details.".to_owned())? {
            Some(row) => row.get(0).map(Some)
                .map_err(|_| "Unable to read saved set details.".to_owned()),
            None => Ok(None),
        }
    }

    pub fn save_stream_state(
        &self,
        state_payload: &str,
        updated_at: &str,
        set_override: Option<(&str, &str)>,
    ) -> Result<(), String> {
        let mut connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        let transaction = connection.transaction()
            .map_err(|_| "Unable to begin saving local stream state.".to_owned())?;
        transaction.execute(
            "INSERT INTO app_state (id, payload, updated_at)
             VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET
               payload = excluded.payload,
               updated_at = excluded.updated_at",
            params![state_payload, updated_at],
        ).map_err(|_| "Unable to save local stream state.".to_owned())?;
        if let Some((set_id, selected_payload)) = set_override {
            transaction.execute(
                "INSERT INTO set_overrides (set_id, payload, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(set_id) DO UPDATE SET
                   payload = excluded.payload,
                   updated_at = excluded.updated_at",
                params![set_id, selected_payload, updated_at],
            ).map_err(|_| "Unable to save set details.".to_owned())?;
        }
        transaction.commit()
            .map_err(|_| "Unable to finish saving local stream state.".to_owned())
    }

    pub fn recent_tournaments(&self) -> Result<Vec<RecentTournament>, String> {
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        let mut statement = connection.prepare(
            "SELECT slug, opened_at
             FROM recent_tournaments
             ORDER BY opened_at DESC
             LIMIT 8"
        ).map_err(|_| "Unable to read recent tournament history.".to_owned())?;
        let rows = statement.query_map([], |row| {
            Ok(RecentTournament {
                slug: row.get(0)?,
                opened_at: row.get(1)?,
            })
        }).map_err(|_| "Unable to read recent tournament history.".to_owned())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Unable to read recent tournament history.".to_owned())
    }

    pub fn startgg_cache(&self, key: &str) -> Result<Option<(String, bool)>, String> {
        use rusqlite::OptionalExtension;
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        connection
            .query_row(
                "SELECT payload, datetime(updated_at) > datetime('now', '-1 day')
                 FROM startgg_cache WHERE cache_key = ?1",
                [key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| "Unable to load cached game data.".to_owned())
    }

    pub fn save_startgg_cache(&self, key: &str, payload: &str) -> Result<(), String> {
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        connection
            .execute(
                "INSERT INTO startgg_cache (cache_key, payload, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(cache_key) DO UPDATE SET
                 payload = excluded.payload, updated_at = excluded.updated_at",
                params![key, payload, now_rfc3339()?],
            )
            .map_err(|_| "Unable to cache game data.".to_owned())?;
        Ok(())
    }

    pub fn clear_startgg_cache_and_history(&self) -> Result<(), String> {
        let mut connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        let transaction = connection.transaction()
            .map_err(|_| "Unable to begin cache cleanup.".to_owned())?;
        transaction.execute("DELETE FROM startgg_cache", [])
            .map_err(|_| "Unable to clear cached bracket data.".to_owned())?;
        transaction.execute("DELETE FROM recent_tournaments", [])
            .map_err(|_| "Unable to clear recent tournament history.".to_owned())?;
        transaction.commit()
            .map_err(|_| "Unable to finish cache cleanup.".to_owned())
    }
}

// Expire inactive matches on startup and selection, rather than on every score or artwork edit.
fn prune_expired_set_overrides(connection: &Connection) -> Result<(), String> {
    connection.execute(
        "DELETE FROM set_overrides
         WHERE (datetime(updated_at) IS NULL OR datetime(updated_at) <= datetime('now', '-7 days'))
           AND set_id != COALESCE((
               SELECT json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END, '$.selectedSet.setId')
               FROM app_state WHERE id = 1
           ), '')",
        [],
    ).map_err(|_| "Unable to remove expired saved match edits.".to_owned())?;
    Ok(())
}

pub fn now_rfc3339() -> Result<String, String> {
    OffsetDateTime::now_utc().format(&Rfc3339)
        .map_err(|_| "Unable to create a local state timestamp.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::Database;

    #[test]
    fn saved_match_edits_expire_after_seven_days_but_preserve_the_on_air_match() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        database.save_overlay_state(r#"{"selectedSet":{"setId":"active"}}"#, "fixture").unwrap();
        {
            let connection = database.connection.lock().unwrap();
            connection.execute_batch(
                "INSERT INTO set_overrides (set_id, payload, updated_at) VALUES ('expired', 'old', datetime('now', '-7 days'));
                 INSERT INTO set_overrides (set_id, payload, updated_at) VALUES ('recent', 'kept', datetime('now', '-6 days'));
                 INSERT INTO set_overrides (set_id, payload, updated_at) VALUES ('active', 'live', datetime('now', '-30 days'));
                 INSERT INTO set_overrides (set_id, payload, updated_at) VALUES ('invalid-date', 'old', 'broken');"
            ).unwrap();
        }
        assert_eq!(database.load_set_override("expired").unwrap(), None);
        assert_eq!(database.load_set_override("invalid-date").unwrap(), None);
        assert_eq!(database.load_set_override("recent").unwrap().as_deref(), Some("kept"));
        assert_eq!(database.load_set_override("active").unwrap().as_deref(), Some("live"));
        database.save_overlay_state(r#"{"selectedSet":{}}"#, "fixture").unwrap();
        assert_eq!(database.load_set_override("active").unwrap(), None);
        assert_eq!(database.load_set_override("recent").unwrap().as_deref(), Some("kept"));
    }

    #[test]
    fn recovery_preserves_rejected_payloads_and_keeps_settings_when_a_logo_is_missing() {
        use crate::{commentators::CommentatorStore, result_screen::ResultScreenStore,
            state::OverlayStore, top_eight_matchups::TopEightMatchupsStore, versus_screen::VersusScreenStore};
        use std::path::Path;
        let database = Database::open(Path::new(":memory:")).unwrap();
        let logos = Path::new("/jabs-test-no-such-logo-directory");
        assert!(database.recovery_notices().unwrap().is_empty());
        let initial = CommentatorStore::load(&database, logos).unwrap().current().unwrap();
        assert!(database.recovery_notices().unwrap().is_empty());
        let mut saved = initial.clone();
        saved["commentators"][0]["name"] = serde_json::json!("Saved commentator");
        saved["tournamentName"] = serde_json::json!("Saved tournament");
        saved["logoAssetId"] = serde_json::json!("removed.png");
        database.save_broadcast_surface("commentators", &saved.to_string(), "fixture").unwrap();
        let restored = CommentatorStore::load(&database, logos).unwrap().current().unwrap();
        saved.as_object_mut().unwrap().remove("logoAssetId");
        assert_eq!(restored, saved);
        assert_eq!(database.recovery_notices().unwrap().len(), 1);
        assert_eq!(serde_json::from_str::<serde_json::Value>(&database.load_broadcast_surface("commentators").unwrap().unwrap()).unwrap(), saved);

        let corrupt = "{broken saved data";
        database.save_overlay_state(corrupt, "fixture").unwrap();
        for surface in ["commentators", "result-screen", "versus-screen", "top-eight-matchups"] {
            database.save_broadcast_surface(surface, corrupt, "fixture").unwrap();
        }
        OverlayStore::load(&database).unwrap();
        CommentatorStore::load(&database, logos).unwrap();
        ResultScreenStore::load(&database).unwrap();
        VersusScreenStore::load(&database).unwrap();
        let top_eight = TopEightMatchupsStore::load(&database).unwrap();
        let connection = database.connection.lock().unwrap();
        let backups: i64 = connection.query_row("SELECT count(*) FROM state_recovery WHERE payload = ?1", [corrupt], |row| row.get(0)).unwrap();
        assert_eq!(backups, 5);
        drop(connection);
        assert_ne!(database.load_overlay_state().unwrap().unwrap(), corrupt);
        assert_eq!(database.recovery_notices().unwrap().len(), 6);

        // Deserializable but invalid settings must also be preserved.
        let mut invalid = top_eight.current().unwrap();
        invalid["tournamentName"] = serde_json::json!("");
        database.save_broadcast_surface("top-eight-matchups", &invalid.to_string(), "fixture").unwrap();
        TopEightMatchupsStore::load(&database).unwrap();
        let connection = database.connection.lock().unwrap();
        let original: String = connection.query_row("SELECT payload FROM state_recovery WHERE payload = ?1", [invalid.to_string()], |row| row.get(0)).unwrap();
        assert_eq!(original, invalid.to_string());
        connection.execute_batch("CREATE TRIGGER reject_backup BEFORE INSERT ON state_recovery BEGIN SELECT RAISE(ABORT, 'test disk failure'); END;").unwrap();
        drop(connection);
        database.save_overlay_state(corrupt, "fixture").unwrap();
        assert!(OverlayStore::load(&database).is_err());
        assert_eq!(database.load_overlay_state().unwrap().unwrap(), corrupt);
    }

    #[test]
    fn recent_history_is_bounded_and_cache_cleanup_removes_game_data() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        for index in 0..10 {
            database.record_recent_tournament(&format!("event-{index}")).unwrap();
        }
        assert_eq!(database.recent_tournaments().unwrap().len(), 8);
        database.save_startgg_cache("fgc-v1", "{\"games\":[]}").unwrap();
        assert_eq!(database.startgg_cache("fgc-v1").unwrap(), Some(("{\"games\":[]}".to_owned(), true)));
        database.connection.lock().unwrap().execute(
            "UPDATE startgg_cache SET updated_at = '2020-01-01T00:00:00Z'", [],
        ).unwrap();
        let (_, fresh) = database.startgg_cache("fgc-v1").unwrap().unwrap();
        assert!(!fresh);
        database.clear_startgg_cache_and_history().unwrap();
        assert!(database.startgg_cache("fgc-v1").unwrap().is_none());
        assert!(database.recent_tournaments().unwrap().is_empty());
    }
}
