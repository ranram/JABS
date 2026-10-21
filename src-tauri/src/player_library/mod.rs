mod lookup;
mod model;
pub mod routes;
pub mod startgg;
mod storage;
pub use model::*;

pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS players (
 local_id TEXT PRIMARY KEY NOT NULL,
 startgg_player_id TEXT UNIQUE,
 imported_profile TEXT NOT NULL,
 overrides TEXT NOT NULL DEFAULT '{}',
 updated_at TEXT NOT NULL,
 seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS player_aliases (
 player_id TEXT NOT NULL REFERENCES players(local_id) ON DELETE CASCADE,
 alias TEXT NOT NULL,
 search_name TEXT NOT NULL COLLATE NOCASE,
 PRIMARY KEY(player_id, alias)
);
CREATE INDEX IF NOT EXISTS player_alias_search ON player_aliases(search_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS players_recent ON players(seen_at DESC);
CREATE INDEX IF NOT EXISTS players_profile_slug ON players(json_extract(imported_profile, '$.profileSlug'));
CREATE TABLE IF NOT EXISTS player_scoreboard_photos (
 player_id TEXT PRIMARY KEY NOT NULL REFERENCES players(local_id) ON DELETE CASCADE,
 settings TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS player_games (
 player_id TEXT NOT NULL REFERENCES players(local_id) ON DELETE CASCADE,
 game_key TEXT NOT NULL,
 preferences TEXT NOT NULL,
 PRIMARY KEY(player_id, game_key)
);
CREATE TABLE IF NOT EXISTS player_versus_media (
 player_id TEXT NOT NULL REFERENCES players(local_id) ON DELETE CASCADE,
 context TEXT NOT NULL,
 placement TEXT NOT NULL,
 PRIMARY KEY(player_id, context)
);";

#[cfg(test)]
mod tests;
