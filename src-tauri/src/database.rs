use rusqlite::{Connection, params};
use serde::Serialize;
use std::{path::Path, sync::Mutex};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

pub struct Database {
    connection: Mutex<Connection>,
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
               updated_at TEXT NOT NULL
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
             );"
        ).map_err(|_| "Unable to initialize JABS's local database.".to_owned())?;
        Ok(Self { connection: Mutex::new(connection) })
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
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
        connection.execute(
            "INSERT INTO broadcast_surfaces (surface_id, payload, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(surface_id) DO UPDATE SET
               payload = excluded.payload,
               updated_at = excluded.updated_at",
            params![surface_id, payload, updated_at],
        ).map_err(|_| "Unable to save the broadcast surface.".to_owned())?;
        Ok(())
    }

    pub fn load_set_override(&self, set_id: &str) -> Result<Option<String>, String> {
        let connection = self.connection.lock()
            .map_err(|_| "Local database is unavailable.".to_owned())?;
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

pub fn now_rfc3339() -> Result<String, String> {
    OffsetDateTime::now_utc().format(&Rfc3339)
        .map_err(|_| "Unable to create a local state timestamp.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::Database;

    #[test]
    fn recent_history_is_bounded_and_clear_preserves_other_tables() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        for index in 0..10 {
            database.record_recent_tournament(&format!("event-{index}")).unwrap();
        }
        assert_eq!(database.recent_tournaments().unwrap().len(), 8);
        database.clear_startgg_cache_and_history().unwrap();
        assert!(database.recent_tournaments().unwrap().is_empty());
    }
}
