use super::{Entry, QueueStore, current_id, pause, reset_result, save};
use crate::{database::Database, state::SelectedSet};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy)]
pub(super) enum ResultSource {
    Overlay { result_invalidated: bool },
    Report(Option<u64>),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ResultStatus {
    Completed,
    Reported,
}

pub(super) fn result_status(set: &SelectedSet) -> Option<ResultStatus> {
    if set.state.as_deref() == Some("3") {
        Some(ResultStatus::Reported)
    } else if set.upstream_reset == Some(false) {
        // Only an acknowledged local score can produce Completed.
        set.winner().map(|_| ResultStatus::Completed)
    } else {
        None
    }
}

impl Entry {
    fn resolve_entrants(&mut self, summary: &Value) -> bool {
        let mut resolved = self.clone();
        let mut changed = false;
        for (field, id, name) in [
            ("entrantOne", &mut resolved.entrant_one_id, &mut resolved.player_one),
            ("entrantTwo", &mut resolved.entrant_two_id, &mut resolved.player_two),
        ] {
            let entrant = &summary[field];
            let Some(next_id) = entrant["id"].as_str().filter(|id| !id.is_empty()) else { continue };
            let next_name = entrant["name"].as_str().map(str::to_owned)
                .and_then(|name| crate::moderation::censor(Some(name)))
                .unwrap_or_else(|| "TBD".into());
            let next_name: String = next_name.chars().take(160).collect();
            changed |= *id != next_id || *name != next_name;
            *id = next_id.to_owned();
            *name = next_name;
        }
        if resolved.entrant_one_id == resolved.entrant_two_id { return false }
        *self = resolved;
        changed
    }
    pub(super) fn restore_result(&mut self, database: &Database) {
        self.restore_saved_result(database, false);
    }

    pub(super) fn restore_fresh_result(&mut self, database: &Database) {
        self.restore_saved_result(database, true);
    }

    fn restore_saved_result(&mut self, database: &Database, freshly_fetched: bool) {
        if self.result_status == Some(ResultStatus::Reported) && !self.upstream_reset {
            return;
        }
        let Some(saved) = self.saved_progress(database) else {
            return;
        };
        // A fresh unreported set takes precedence over a saved report from before a reset.
        if freshly_fetched && self.result_status.is_none() && saved.state.as_deref() == Some("3") {
            self.upstream_reset = true;
            return;
        }
        if saved.upstream_reset == Some(true) {
            self.upstream_reset = true;
            self.result_status = None;
            return;
        }
        if self.result_status.is_some() {
            return;
        }
        let result = result_status(&saved);
        if !self.upstream_reset
            || (saved.upstream_reset == Some(false) && result != Some(ResultStatus::Reported))
        {
            self.result_status = result;
        }
    }

    fn saved_progress(&self, database: &Database) -> Option<SelectedSet> {
        database
            .load_set_override(&self.set_id)
            .ok()
            .flatten()
            .and_then(|payload| serde_json::from_str::<SelectedSet>(&payload).ok())
            .and_then(|mut saved| {
                crate::state::migrate_match_format(&mut saved);
                let same_players = (saved.player_one.entrant_id == self.entrant_one_id
                    && saved.player_two.entrant_id == self.entrant_two_id)
                    || (saved.player_one.entrant_id == self.entrant_two_id
                        && saved.player_two.entrant_id == self.entrant_one_id);
                if saved.set_id.as_deref() == Some(self.set_id.as_str())
                    && same_players
                    && crate::state::validate_selected_set(&saved).is_ok()
                {
                    Some(saved)
                } else {
                    None
                }
            })
    }
}

impl QueueStore {
    pub(super) fn observe_result(&self, database: &Database, set: &SelectedSet) {
        if let Some(set_id) = &set.set_id {
            let _ = self.record_result(
                database,
                set_id,
                result_status(set),
                ResultSource::Overlay {
                    result_invalidated: set.upstream_reset == Some(true),
                },
            );
        }
    }

    pub fn result_was_reset(&self, set: &SelectedSet) -> Result<bool, String> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        Ok(inner
            .snapshot
            .context
            .as_ref()
            .map(|context| context.event_id.as_str())
            == set.event_id.as_deref()
            && inner.snapshot.entries.iter().any(|entry| {
                Some(entry.set_id.as_str()) == set.set_id.as_deref() && entry.upstream_reset
            }))
    }

    /// Reconcile only matches returned by this event's existing bracket request.
    pub fn observe_bracket(
        &self,
        database: &Database,
        event_id: &str,
        sets: &[Value],
    ) -> Result<Vec<String>, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        if inner
            .snapshot
            .context
            .as_ref()
            .map(|context| context.event_id.as_str())
            != Some(event_id)
        {
            return Ok(Vec::new());
        }
        let mut next = inner.clone();
        let active_id = current_id(&inner.snapshot).map(str::to_owned);
        let mut changed = false;
        let mut active_reset = false;
        let mut reset_ids = Vec::new();
        let active_result = inner.snapshot.running
            || inner.reported
            || inner.winner.is_some()
            || inner.snapshot.remaining_ms.is_some()
            || inner.loading;
        for entry in &mut next.snapshot.entries {
            let Some(set) = sets
                .iter()
                .find(|set| set["id"].as_str() == Some(entry.set_id.as_str()))
            else {
                continue;
            };
            if !entry.has_players() && active_id.as_deref() != Some(entry.set_id.as_str()) {
                changed |= entry.resolve_entrants(set);
            }
            let one = set["entrantOne"]["id"].as_str();
            let two = set["entrantTwo"]["id"].as_str();
            let same_players = (one == Some(entry.entrant_one_id.as_str())
                && two == Some(entry.entrant_two_id.as_str()))
                || (one == Some(entry.entrant_two_id.as_str())
                    && two == Some(entry.entrant_one_id.as_str()));
            match set["state"].as_str() {
                Some("3")
                    if same_players
                        && (entry.result_status != Some(ResultStatus::Reported)
                            || entry.upstream_reset) =>
                {
                    entry.result_status = Some(ResultStatus::Reported);
                    entry.upstream_reset = false;
                    changed = true;
                }
                Some("1" | "2") => {
                    let reopened = entry.result_status == Some(ResultStatus::Reported);
                    if entry.result_status.is_none() && !entry.upstream_reset {
                        continue;
                    }
                    let local_reset = entry
                        .saved_progress(database)
                        .and_then(|saved| saved.upstream_reset);
                    let legacy_completed = entry.result_status == Some(ResultStatus::Completed)
                        && local_reset.is_none();
                    if !reopened && !entry.upstream_reset && !legacy_completed {
                        continue;
                    }
                    if !reopened && local_reset == Some(false) {
                        continue;
                    }
                    let invalidated = entry.result_status.is_some() || !entry.upstream_reset;
                    if reopened || local_reset.is_none() {
                        reset_ids.push(entry.set_id.clone());
                    }
                    entry.result_status = None;
                    entry.upstream_reset = true;
                    active_reset |= active_id.as_deref() == Some(entry.set_id.as_str())
                        && (invalidated || (local_reset.is_none() && active_result));
                    changed |= invalidated;
                }
                _ => {}
            }
        }
        if !changed && !active_reset {
            return Ok(reset_ids);
        }
        if active_reset {
            pause(&mut next);
            reset_result(&mut next);
            next.snapshot.revision += 1;
        }
        save(database, &next.snapshot)?;
        *inner = next;
        self.publish(&inner);
        Ok(reset_ids)
    }

    pub(super) fn record_result(
        &self,
        database: &Database,
        set_id: &str,
        result: Option<ResultStatus>,
        source: ResultSource,
    ) -> Result<(), String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        let Some(index) = inner
            .snapshot
            .entries
            .iter()
            .position(|entry| entry.set_id == set_id)
        else {
            return Ok(());
        };
        let entry = &inner.snapshot.entries[index];
        let observed_reset = matches!(
            source,
            ResultSource::Overlay {
                result_invalidated: true
            }
        );
        // Local score updates cannot undo an upstream report; bracket refreshes detect resets.
        if entry.result_status == Some(ResultStatus::Reported)
            && matches!(source, ResultSource::Overlay { .. })
            && !observed_reset
        {
            return Ok(());
        }
        let reset_pending = entry.upstream_reset || observed_reset;
        let invalidates_current =
            observed_reset && !entry.upstream_reset && current_id(&inner.snapshot) == Some(set_id);
        if reset_pending {
            match source {
                ResultSource::Overlay { .. } if result == Some(ResultStatus::Reported) => {
                    return Ok(());
                }
                ResultSource::Report(Some(token)) if token != inner.activation => return Ok(()),
                _ => {}
            }
        }
        let upstream_reset = reset_pending && result != Some(ResultStatus::Reported);
        if entry.result_status == result && entry.upstream_reset == upstream_reset {
            return Ok(());
        }
        let mut next = inner.clone();
        next.snapshot.entries[index].result_status = result;
        next.snapshot.entries[index].upstream_reset = upstream_reset;
        if invalidates_current {
            pause(&mut next);
            reset_result(&mut next);
            next.snapshot.revision += 1;
        }
        save(database, &next.snapshot)?;
        *inner = next;
        self.publish(&inner);
        Ok(())
    }
}
