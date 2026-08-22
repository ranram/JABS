use crate::generated_moderation_terms as terms;
use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, RwLock};
use unicode_normalization::UnicodeNormalization;

static ALL_TERMS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    [
        terms::EN, terms::FR, terms::DE, terms::IT, terms::PT, terms::ES,
        terms::AR, terms::ZH, terms::JA, terms::HI, terms::KO, terms::RU,
    ]
    .into_iter()
    .flat_map(|catalog| catalog.iter().copied())
    .collect()
});

static SAFE_COMPOUND_PARTS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    terms::SAFE_COMPOUND_PARTS.iter().copied().collect()
});

const RESULT_CACHE_LIMIT: usize = 512;
static RESULT_CACHE: LazyLock<RwLock<HashMap<String, bool>>> =
    LazyLock::new(|| RwLock::new(HashMap::with_capacity(RESULT_CACHE_LIMIT)));

pub fn censor(value: Option<String>) -> Option<String> {
    value.map(|value| {
        if contains_blocked_text(&value) { "[blocked]".to_owned() } else { value }
    })
}

pub fn assert_safe(field_values: &[(&str, Option<&str>)]) -> Result<(), String> {
    let blocked = field_values.iter().filter_map(|(field, value)| {
        value
            .filter(|value| contains_blocked_text(value))
            .map(|_| *field)
    }).collect::<Vec<_>>();
    if blocked.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Blocked offensive text in {}. Remove it before saving stream state.",
            blocked.join(", ")
        ))
    }
}

pub fn contains_blocked_text(value: &str) -> bool {
    debug_assert!(!terms::SOURCE_DIGEST.is_empty());
    if let Ok(cache) = RESULT_CACHE.read()
        && let Some(blocked) = cache.get(value)
    {
        return *blocked;
    }
    let blocked = moderation_candidates_are_blocked(value);
    if let Ok(mut cache) = RESULT_CACHE.write() {
        if cache.len() >= RESULT_CACHE_LIMIT {
            cache.clear();
        }
        cache.insert(value.to_owned(), blocked);
    }
    blocked
}

fn moderation_candidates_are_blocked(value: &str) -> bool {
    let normalized = value.nfkc().collect::<String>();
    let lower = normalized.to_lowercase();
    let leetspeak = lower.chars().map(|character| match character {
        '0' => 'o',
        '1' => 'i',
        '3' => 'e',
        '4' => 'a',
        '5' => 's',
        '7' => 't',
        '@' => 'a',
        '$' => 's',
        other => other,
    }).collect::<String>();
    let symbol_spaced = collapse_spaces(&leetspeak.chars().map(|character| {
        if character.is_alphanumeric() || character.is_whitespace() { character } else { ' ' }
    }).collect::<String>());
    let symbol_compact = leetspeak.chars()
        .filter(|character| character.is_alphanumeric() || character.is_whitespace())
        .collect::<String>();
    let alphanumeric_compact = leetspeak.chars()
        .filter(|character| character.is_alphanumeric())
        .collect::<String>();
    let collapsed_repeats = collapse_repeats(&leetspeak);
    // Mixed-case tags such as "HelloFAG" intentionally separate identity slurs from
    // ordinary words. Splitting case transitions lets whole-word matching catch the
    // slur without maintaining a curated list of short high-risk terms.
    let case_split = split_case_transitions(&normalized).to_lowercase();
    let candidates = [
        lower,
        leetspeak.clone(),
        symbol_spaced,
        symbol_compact,
        alphanumeric_compact,
        collapsed_repeats,
        case_split,
    ];
    let mut seen = HashSet::with_capacity(12);
    for candidate in candidates {
        if seen.insert(candidate.clone()) && candidate_is_blocked(&candidate) {
            return true;
        }
    }
    for vowel in ['a', 'e', 'i', 'o', 'u'] {
        let candidate = leetspeak.replace(['*', '＊'], &vowel.to_string());
        if seen.insert(candidate.clone()) && candidate_is_blocked(&candidate) {
            return true;
        }
    }
    false
}

fn candidate_is_blocked(candidate: &str) -> bool {
    let words = candidate
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    if ALL_TERMS.contains(candidate.trim()) || words.iter().any(|word| ALL_TERMS.contains(word)) {
        return true;
    }
    for start in 0..words.len() {
        let mut phrase = String::new();
        for word in words.iter().skip(start).take(8) {
            if !phrase.is_empty() { phrase.push(' '); }
            phrase.push_str(word);
            if ALL_TERMS.contains(phrase.as_str()) { return true; }
        }
    }
    words.into_iter().any(joined_token_is_blocked)
}

fn joined_token_is_blocked(token: &str) -> bool {
    if term_or_spelling_variant_is_blocked(token) { return true; }
    token.char_indices().skip(1).any(|(split, _)| {
        let (prefix, suffix) = token.split_at(split);
        let prefix_length = prefix.chars().count();
        let suffix_length = suffix.chars().count();
        let prefix_blocked = term_or_spelling_variant_is_blocked(prefix);
        let suffix_blocked = term_or_spelling_variant_is_blocked(suffix);

        // Longer reviewed terms are sufficiently distinctive to match at a
        // joined-token edge. Four-character terms need positive evidence that
        // the other side is an ordinary word, or common names such as
        // "Hitchcock" become false positives.
        (prefix_blocked && prefix_length >= 5)
            || (suffix_blocked && suffix_length >= 5)
            || (prefix_blocked
                && prefix_length >= 4
                && SAFE_COMPOUND_PARTS.contains(suffix))
            || (suffix_blocked
                && suffix_length >= 4
                && SAFE_COMPOUND_PARTS.contains(prefix))
    })
}

fn term_or_spelling_variant_is_blocked(token: &str) -> bool {
    if ALL_TERMS.contains(token) { return true; }
    let Some((last_index, last_character)) = token.char_indices().last() else {
        return false;
    };
    let replacement = match last_character {
        'i' => 'y',
        _ => return false,
    };
    let mut variant = String::with_capacity(token.len());
    variant.push_str(&token[..last_index]);
    variant.push(replacement);
    ALL_TERMS.contains(variant.as_str())
}

fn split_case_transitions(value: &str) -> String {
    let mut result = String::new();
    let mut previous_lowercase = false;
    for character in value.chars() {
        if character.is_uppercase() && previous_lowercase {
            result.push(' ');
        }
        previous_lowercase = character.is_lowercase();
        result.push(character);
    }
    result
}

fn collapse_spaces(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn collapse_repeats(value: &str) -> String {
    let mut result = String::new();
    let mut previous = None;
    let mut repeated = 0;
    for character in value.chars() {
        if previous == Some(character) {
            repeated += 1;
            if repeated < 3 { result.push(character); }
        } else {
            previous = Some(character);
            repeated = 1;
            result.push(character);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{assert_safe, censor, contains_blocked_text};

    #[test]
    fn blocks_reviewed_slur_obfuscation_without_common_tag_false_positive() {
        assert!(contains_blocked_text("GAYFAGGOT"));
        assert!(contains_blocked_text("HelloFAG"));
        assert!(contains_blocked_text("gayf@ggot"));
        assert!(contains_blocked_text("fa ggot"));
        assert!(contains_blocked_text("fu-ck"));
        assert!(contains_blocked_text("tranniepower"));
        assert!(contains_blocked_text("TranniePower"));
        assert!(contains_blocked_text("tr@nny"));
        assert!(contains_blocked_text("tranni"));
        assert!(contains_blocked_text("trannipower"));
        assert!(contains_blocked_text("superporn"));
        assert!(contains_blocked_text("enculé"));
        assert!(contains_blocked_text("scheiße"));
        assert!(contains_blocked_text("coño"));
        assert!(contains_blocked_text("cabrón"));
        assert!(!contains_blocked_text("TEAM B"));
        assert!(!contains_blocked_text("BEAST"));
        assert!(!contains_blocked_text("cumulative"));
        assert!(!contains_blocked_text("Danny"));
        assert!(!contains_blocked_text("Danny."));
        assert!(!contains_blocked_text("Zippy"));
        assert!(!contains_blocked_text("Carnage"));
        assert!(!contains_blocked_text("Loser"));
        assert!(!contains_blocked_text("Losers Finals"));
        assert!(!contains_blocked_text("LosersClub"));
        assert!(!contains_blocked_text("TheLosers"));
        assert!(!contains_blocked_text("Gay Pride"));
        assert!(!contains_blocked_text("Gay Man"));
        assert!(!contains_blocked_text("Transgendered"));
        assert!(!contains_blocked_text("Asexual"));
        assert!(!contains_blocked_text("Bisexual"));
        assert!(!contains_blocked_text("Cisgender"));
        assert!(!contains_blocked_text("Pansexual"));
        assert!(!contains_blocked_text("Homoerótico"));
        for value in [
            "TNS",
            "UMvC3",
            "Parsec",
            "#211",
            "TNS UMvC3",
            "UMvC3 Parsec",
            "Parsec #211",
            "TNS UMvC3 Parsec #211",
        ] {
            assert!(!contains_blocked_text(value), "ordinary tournament text was blocked: {value}");
        }
        assert!(!contains_blocked_text("assistant"));
        assert!(!contains_blocked_text("classic"));
        assert!(!contains_blocked_text("Hitchcock"));
        assert!(!contains_blocked_text("Guadalcanal"));
        assert!(!contains_blocked_text("cocktail"));
        assert!(contains_blocked_text("beastiality"));
        assert!(contains_blocked_text("iFag"));
        assert!(!contains_blocked_text("iPodTouch"));
        assert_eq!(censor(Some("faggot".to_owned())).as_deref(), Some("[blocked]"));
    }

    #[test]
    fn neutral_identity_terms_are_safe_and_rejections_do_not_echo_input() {
        for value in [
            "agender",
            "asexual",
            "bigender",
            "bisexual",
            "butch",
            "cisgender",
            "demiboy",
            "demigirl",
            "drag king",
            "drag queen",
            "drag-queen",
            "dragqueen",
            "femboy",
            "femme",
            "gay",
            "genderfluid",
            "genderqueer",
            "intersex",
            "lesbian",
            "non-binary",
            "nonbinary",
            "pansexual",
            "queer",
            "trans",
            "transgender",
            "two-spirit",
        ] {
            assert!(!contains_blocked_text(value), "neutral identity term was blocked: {value}");
        }
        for pronouns in [
            "he/him",
            "she/her",
            "they/them",
            "he/they",
            "she/they",
            "xe/xem",
            "ze/zir",
            "any pronouns",
        ] {
            assert!(assert_safe(&[("Player one pronouns", Some(pronouns))]).is_ok());
        }
        let error = assert_safe(&[("playerOne.pronouns", Some("tr@nny"))]).unwrap_err();
        assert!(error.contains("playerOne.pronouns"));
        assert!(!error.contains("tr@nny"));
    }
}
