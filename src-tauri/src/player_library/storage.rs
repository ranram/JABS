use super::{LibraryPlayer, Profile, clean_profile, validate};
use crate::database::{Database, now_rfc3339};
use rusqlite::{Connection, OptionalExtension, params};

fn db_error(_: impl std::fmt::Display) -> String {
    "Unable to read or save the player library.".into()
}
fn read(connection: &Connection, id: &str) -> Result<Option<LibraryPlayer>, String> {
    let row = connection
        .query_row(
            "SELECT local_id, startgg_player_id, imported_profile, overrides, updated_at, seen_at
             FROM players WHERE local_id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .map_err(db_error)?;
    let Some((local_id, player_id, imported, overrides, updated_at, seen_at)) = row else {
        return Ok(None);
    };
    let mut aliases = connection
        .prepare("SELECT alias FROM player_aliases WHERE player_id = ?1 ORDER BY alias")
        .map_err(db_error)?;
    let aliases = aliases
        .query_map([id], |row| row.get(0))
        .map_err(db_error)?
        .collect::<Result<Vec<String>, _>>()
        .map_err(db_error)?;
    let mut games = connection
        .prepare("SELECT preferences FROM player_games WHERE player_id = ?1 ORDER BY game_key")
        .map_err(db_error)?;
    let games = games
        .query_map([id], |row| row.get(0))
        .map_err(db_error)?
        .collect::<Result<Vec<String>, _>>()
        .map_err(db_error)?;
    Ok(Some(LibraryPlayer {
        scoreboard_photo: connection.query_row(
            "SELECT settings FROM player_scoreboard_photos WHERE player_id = ?1", [id],
            |row| row.get::<_, String>(0)
        ).optional().map_err(db_error)?.map(|value| serde_json::from_str(&value).map_err(db_error)).transpose()?,
        local_id,
        player_id,
        imported: serde_json::from_str(&imported).map_err(db_error)?,
        overrides: serde_json::from_str(&overrides).map_err(db_error)?,
        aliases,
        games: games
            .iter()
            .map(|s| serde_json::from_str(s).map_err(db_error))
            .collect::<Result<_, _>>()?,
        updated_at,
        seen_at,
    }))
}
fn linked_id(connection: &Connection, player_id: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT local_id FROM players WHERE startgg_player_id = ?1",
            [player_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)
}
fn add_alias(connection: &Connection, id: &str, alias: &str) -> Result<(), String> {
    if alias.is_empty() {
        return Ok(());
    }
    connection
        .execute(
            "INSERT OR IGNORE INTO player_aliases(player_id, alias, search_name)
             VALUES (?1, ?2, ?3)",
            params![id, alias, alias.to_lowercase()],
        )
        .map_err(db_error)?;
    connection
        .execute(
            "DELETE FROM player_aliases
             WHERE player_id = ?1 AND alias NOT IN (
                 SELECT alias FROM player_aliases
                 WHERE player_id = ?1 ORDER BY rowid DESC LIMIT 30
             )",
            [id],
        )
        .map_err(db_error)?;
    Ok(())
}
fn write_record(connection: &Connection, player: &LibraryPlayer) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO players(local_id, startgg_player_id, imported_profile, overrides, updated_at, seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(local_id) DO UPDATE SET
                 startgg_player_id = excluded.startgg_player_id,
                 overrides = excluded.overrides,
                 updated_at = excluded.updated_at",
            params![
                player.local_id,
                player.player_id,
                serde_json::to_string(&player.imported).map_err(db_error)?,
                serde_json::to_string(&player.overrides).map_err(db_error)?,
                player.updated_at,
                player.seen_at,
            ],
        )
        .map_err(db_error)?;
    connection.execute("DELETE FROM player_scoreboard_photos WHERE player_id=?1", [&player.local_id]).map_err(db_error)?;
    if let Some(photo) = &player.scoreboard_photo {
        connection.execute("INSERT INTO player_scoreboard_photos(player_id, settings) VALUES (?1, ?2)",
            params![player.local_id, serde_json::to_string(photo).map_err(db_error)?]).map_err(db_error)?;
    }
    connection
        .execute(
            "DELETE FROM player_aliases WHERE player_id=?1",
            [&player.local_id],
        )
        .map_err(db_error)?;
    for alias in player
        .aliases
        .iter()
        .chain(std::iter::once(&player.imported.name))
        .chain(player.overrides.get("name"))
    {
        add_alias(connection, &player.local_id, alias)?;
    }
    connection
        .execute(
            "DELETE FROM player_games WHERE player_id=?1",
            [&player.local_id],
        )
        .map_err(db_error)?;
    for game in &player.games {
        connection
            .execute(
                "INSERT INTO player_games(player_id,game_key,preferences) VALUES (?1,?2,?3)",
                params![
                    player.local_id,
                    game.game_key,
                    serde_json::to_string(game).map_err(db_error)?
                ],
            )
            .map_err(db_error)?;
    }
    Ok(())
}
impl Database {
    pub fn library_player(&self, id: &str) -> Result<Option<LibraryPlayer>, String> {
        read(&*self.connection.lock().map_err(db_error)?, id)
    }
    pub fn library_profile_slug(&self, slug: &str) -> Result<Option<LibraryPlayer>, String> {
        let connection = self.connection.lock().map_err(db_error)?;
        let mut statement = connection
            .prepare(
                "SELECT local_id FROM players
                 WHERE json_extract(imported_profile, '$.profileSlug') = ?1 LIMIT 2",
            )
            .map_err(db_error)?;
        let ids = statement
            .query_map([slug], |row| row.get(0))
            .map_err(db_error)?
            .collect::<Result<Vec<String>, _>>()
            .map_err(db_error)?;
        // If old data links one URL to multiple IDs, let start.gg identify its current Player rather than choosing arbitrarily.
        match ids.as_slice() {
            [id] => read(&connection, id),
            _ => Ok(None),
        }
    }
    pub fn library_resolve(
        &self,
        local: Option<&str>,
        remote: Option<&str>,
    ) -> Result<Option<LibraryPlayer>, String> {
        let connection = self.connection.lock().map_err(db_error)?;
        let linked = remote
            .map(|id| linked_id(&connection, id))
            .transpose()?
            .flatten();
        if let Some(local) = local {
            let record = read(&connection, local)?.ok_or("This saved player no longer exists.")?;
            if remote.is_some_and(|remote| record.player_id.as_deref() != Some(remote))
                || linked.as_deref().is_some_and(|id| id != local)
            {
                return Err("The local and start.gg player IDs refer to different players.".into());
            }
            return Ok(Some(record));
        }
        linked
            .map(|id| read(&connection, &id))
            .transpose()
            .map(Option::flatten)
    }
    /// Save each fetched page in one transaction, leaving game defaults and manual overrides unchanged.
    pub fn observe_players(&self, profiles: Vec<(String, Profile)>) -> Result<usize, String> {
        let mut connection = self.connection.lock().map_err(db_error)?;
        let transaction = connection.transaction().map_err(db_error)?;
        let now = now_rfc3339()?;
        let mut added = 0;
        for (remote_id, mut profile) in profiles {
            if !super::valid_startgg_id(&remote_id) {
                continue;
            }
            clean_profile(&mut profile);
            let existing = linked_id(&transaction, &remote_id)?;
            let id = match existing {
                Some(id) => {
                    // A missing linked user cannot tell us whether individual public fields were cleared.
                    if let Some(old) = read(&transaction, &id)? {
                        if profile.name.is_empty() {
                            profile.name = super::clean_text(&old.imported.name);
                        }
                        add_alias(&transaction, &id, &old.imported.name)?;
                        if profile.profile_slug.is_none() {
                            profile.profile_slug = old.imported.profile_slug;
                            profile.pronouns = profile.pronouns.or(old.imported.pronouns);
                            profile.country = profile.country.or(old.imported.country);
                            profile.state = profile.state.or(old.imported.state);
                            profile.x_handle = profile.x_handle.or(old.imported.x_handle);
                        }
                    }
                    id
                }
                None => {
                    added += 1;
                    transaction
                        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| {
                            r.get::<_, String>(0)
                        })
                        .map_err(db_error)?
                }
            };
            if profile.name.is_empty() {
                profile.name = format!("Player #{remote_id}");
            }
            transaction
                .execute(
                    "INSERT INTO players(local_id, startgg_player_id, imported_profile, updated_at, seen_at)
                     VALUES (?1, ?2, ?3, ?4, ?4)
                     ON CONFLICT(startgg_player_id) DO UPDATE SET
                         imported_profile = excluded.imported_profile,
                         updated_at = excluded.updated_at,
                         seen_at = excluded.seen_at",
                    params![id, remote_id, serde_json::to_string(&profile).map_err(db_error)?, now],
                )
                .map_err(db_error)?;
            add_alias(&transaction, &id, &profile.name)?;
        }
        transaction.commit().map_err(db_error)?;
        Ok(added)
    }
    pub fn library_save(
        &self,
        mut player: LibraryPlayer,
    ) -> Result<super::LibrarySaveResult, String> {
        let mut connection = self.connection.lock().map_err(db_error)?;
        let transaction = connection.transaction().map_err(db_error)?;
        let previous = read(&transaction, &player.local_id)?;
        if let Some(previous) = &previous {
            if previous.updated_at != player.updated_at {
                return Err("This player changed. Reload the record before saving.".into());
            }
            if previous.player_id.is_some() && previous.player_id != player.player_id {
                return Err("A linked start.gg identity cannot be replaced.".into());
            }
            // Only start.gg imports may change the imported profile fields.
            player.imported = previous.imported.clone();
            player.seen_at = previous.seen_at.clone();
        }
        let warnings = validate(&mut player, previous.as_ref())?;
        if let Some(remote) = &player.player_id {
            if linked_id(&transaction, remote)?.is_some_and(|id| id != player.local_id) {
                return Err("That start.gg player is already linked to another record.".into());
            }
        }
        player.updated_at = now_rfc3339()?;
        if previous.is_none() {
            player.seen_at = player.updated_at.clone();
        }
        write_record(&transaction, &player)?;
        transaction.commit().map_err(db_error)?;
        let player = read(&connection, &player.local_id)?.ok_or("Player could not be saved.")?;
        Ok(super::LibrarySaveResult { player, warnings })
    }
    pub fn library_search(
        &self,
        query: &str,
        offset: u32,
    ) -> Result<(Vec<LibraryPlayer>, u32), String> {
        let connection = self.connection.lock().map_err(db_error)?;
        // Escape LIKE wildcards: tags containing '%' or '_' are literal names.
        let prefix = format!(
            "{}%",
            query
                .trim()
                .to_lowercase()
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        let (sql, count_sql) = if query.trim().is_empty() {
            (
                "SELECT local_id FROM players ORDER BY seen_at DESC, local_id LIMIT 50 OFFSET ?2",
                "SELECT count(*) FROM players",
            )
        } else {
            (
                "SELECT local_id FROM players
                 WHERE local_id IN (
                     SELECT player_id FROM player_aliases
                     WHERE search_name LIKE ?1 ESCAPE '\\'
                 )
                 ORDER BY seen_at DESC, local_id LIMIT 50 OFFSET ?2",
                "SELECT count(DISTINCT player_id) FROM player_aliases
                 WHERE search_name LIKE ?1 ESCAPE '\\'",
            )
        };
        let mut statement = connection.prepare(sql).map_err(db_error)?;
        let ids = statement
            .query_map(params![prefix, offset], |row| row.get(0))
            .map_err(db_error)?
            .collect::<Result<Vec<String>, _>>()
            .map_err(db_error)?;
        let total = if query.trim().is_empty() {
            connection
                .query_row(count_sql, [], |row| row.get(0))
                .map_err(db_error)?
        } else {
            connection
                .query_row(count_sql, [&prefix], |row| row.get(0))
                .map_err(db_error)?
        };
        let players = ids
            .iter()
            .map(|id| read(&connection, id)?.ok_or_else(|| "Player no longer exists.".into()))
            .collect::<Result<_, String>>()?;
        Ok((players, total))
    }
    pub fn library_import(
        &self,
        mut players: Vec<LibraryPlayer>,
    ) -> Result<(usize, usize), String> {
        if players.len() > 200 {
            return Err("Import at most 200 players per batch.".into());
        }
        for player in &mut players {
            let _ = validate(player, None)?;
        }
        let mut connection = self.connection.lock().map_err(db_error)?;
        let transaction = connection.transaction().map_err(db_error)?;
        let mut added = 0;
        let mut skipped = 0;
        for mut player in players {
            if read(&transaction, &player.local_id)?.is_some()
                || player
                    .player_id
                    .as_deref()
                    .map(|id| linked_id(&transaction, id))
                    .transpose()?
                    .flatten()
                    .is_some()
            {
                skipped += 1;
                continue;
            }
            player.updated_at = now_rfc3339()?;
            player.seen_at = player.updated_at.clone();
            write_record(&transaction, &player)?;
            added += 1;
        }
        transaction.commit().map_err(db_error)?;
        Ok((added, skipped))
    }
    pub fn library_delete(&self, id: &str, updated_at: &str) -> Result<(), String> {
        let changed = self
            .connection
            .lock()
            .map_err(db_error)?
            .execute(
                "DELETE FROM players WHERE local_id=?1 AND updated_at=?2",
                params![id, updated_at],
            )
            .map_err(db_error)?;
        if changed != 1 {
            return Err("This player changed. Reload before deleting.".into());
        }
        Ok(())
    }
}
