use serde::Deserialize;
use std::{collections::HashMap, sync::OnceLock};
use unicode_normalization::UnicodeNormalization;

const POLICY_JSON: &str = include_str!("../../src/shared/matchFormatPolicies.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchFormatPolicies {
    allowed_best_of: Vec<u32>,
    default_best_of: u32,
    top_eight_best_of: u32,
    top_eight_patterns: Vec<String>,
    game_overrides: HashMap<String, MatchFormatOverride>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchFormatOverride {
    default_best_of: Option<u32>,
    top_eight_best_of: Option<u32>,
    #[serde(default)]
    round_rules: Vec<MatchFormatRule>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchFormatRule {
    best_of: u32,
    patterns: Vec<String>,
}

fn policies() -> &'static MatchFormatPolicies {
    static POLICIES: OnceLock<MatchFormatPolicies> = OnceLock::new();
    POLICIES.get_or_init(|| {
        let policies: MatchFormatPolicies = serde_json::from_str(POLICY_JSON)
            .expect("the bundled match-format policy must be valid JSON");
        assert_eq!(policies.allowed_best_of, [3, 5]);
        policies
    })
}

fn normalize(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut previous_was_space = true;
    for character in value.nfkd().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() {
            normalized.push(character);
            previous_was_space = false;
        } else if !previous_was_space {
            normalized.push(' ');
            previous_was_space = true;
        }
    }
    normalized.trim().to_owned()
}

pub fn default_best_of(
    game_id: &str,
    phase: Option<&str>,
    phase_group: Option<&str>,
    round: Option<&str>,
) -> u32 {
    let policies = policies();
    let game_override = policies.game_overrides.get(game_id);
    let normalized_round = normalize(round.unwrap_or_default());

    if let Some(rule) = game_override
        .and_then(|game_override| game_override.round_rules.iter().find(|rule| {
            rule.patterns
                .iter()
                .any(|pattern| normalized_round.contains(&normalize(pattern)))
        }))
    {
        return rule.best_of;
    }

    let context = normalize(&[phase, phase_group, round]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" "));
    let is_top_eight = policies
        .top_eight_patterns
        .iter()
        .any(|pattern| context.contains(&normalize(pattern)));
    if is_top_eight {
        return game_override
            .and_then(|game_override| game_override.top_eight_best_of)
            .unwrap_or(policies.top_eight_best_of);
    }

    game_override
        .and_then(|game_override| game_override.default_best_of)
        .unwrap_or(policies.default_best_of)
}

#[cfg(test)]
mod tests {
    use super::default_best_of;

    #[test]
    fn applies_phase_defaults_and_game_overrides() {
        assert_eq!(
            default_best_of("street-fighter-6", Some("Pools"), None, None),
            3
        );
        assert_eq!(
            default_best_of("street-fighter-6", Some("Top 8"), None, None),
            5
        );
        assert_eq!(
            default_best_of("guilty-gear-strive", Some("Pools"), None, None),
            5
        );
        assert_eq!(
            default_best_of("2xko", Some("Top 8"), None, Some("Winners Semifinal")),
            3
        );
        assert_eq!(
            default_best_of("2xko", Some("Top 8"), None, Some("Losers Final")),
            5
        );
        assert_eq!(
            default_best_of("2xko", Some("Pools"), None, Some("Grand Final Reset")),
            5
        );
    }
}
