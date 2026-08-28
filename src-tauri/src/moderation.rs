use crate::generated_moderation_terms as terms;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
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

const RUNTIME_ALLOWLIST_MAX_BYTES: u64 = 64 * 1024;
const RUNTIME_ALLOWLIST_MAX_ENTRIES: usize = 1_024;
const RUNTIME_ALLOWLIST_MAX_ENTRY_CHARS: usize = 256;
const RUNTIME_ALLOWLIST_TEMPLATE: &str = "# JABS moderation allowlist\n\
# Add one exact player tag, sponsor, pronoun value, or other field value per line.\n\
# Matching ignores capitalization and repeated whitespace. Lines beginning with # are comments.\n";

#[derive(Default)]
struct RuntimeAllowlist {
    path: Option<PathBuf>,
    entries: HashSet<String>,
}

static RUNTIME_ALLOWLIST: LazyLock<RwLock<RuntimeAllowlist>> =
    LazyLock::new(|| RwLock::new(RuntimeAllowlist::default()));

pub fn initialize_runtime_allowlist(path: PathBuf) -> Result<usize, String> {
    let file_path = path.clone();
    let mut allowlist = RUNTIME_ALLOWLIST
        .write()
        .map_err(|_| "The moderation allowlist is unavailable.".to_owned())?;
    allowlist.path = Some(path);
    drop(allowlist);
    ensure_runtime_allowlist_file(&file_path)?;
    reload_runtime_allowlist()
}

pub fn reload_runtime_allowlist() -> Result<usize, String> {
    let path = RUNTIME_ALLOWLIST
        .read()
        .map_err(|_| "The moderation allowlist is unavailable.".to_owned())?
        .path
        .clone()
        .ok_or_else(|| "The moderation allowlist has not been initialized.".to_owned())?;
    let entries = read_runtime_allowlist(&path)?;
    let count = entries.len();
    RUNTIME_ALLOWLIST
        .write()
        .map_err(|_| "The moderation allowlist is unavailable.".to_owned())?
        .entries = entries;
    clear_result_cache();
    Ok(count)
}

pub fn ensure_runtime_allowlist_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        if path.is_file() {
            return Ok(());
        }
        return Err("The moderation allowlist path is not a file.".to_owned());
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|_| "JABS could not create the moderation allowlist.".to_owned())?;
    file.write_all(RUNTIME_ALLOWLIST_TEMPLATE.as_bytes())
        .map_err(|_| "JABS could not initialize the moderation allowlist.".to_owned())
}

fn read_runtime_allowlist(path: &Path) -> Result<HashSet<String>, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|_| "JABS could not read the moderation allowlist.".to_owned())?;
    if metadata.len() > RUNTIME_ALLOWLIST_MAX_BYTES {
        return Err("The moderation allowlist must be 64 KiB or smaller.".to_owned());
    }
    let contents = std::fs::read_to_string(path)
        .map_err(|_| "The moderation allowlist must be valid UTF-8 text.".to_owned())?;
    parse_runtime_allowlist(&contents)
}

fn parse_runtime_allowlist(contents: &str) -> Result<HashSet<String>, String> {
    let mut entries = HashSet::new();
    for (index, line) in contents.lines().enumerate() {
        let line = line.trim_start_matches('\u{feff}').trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let entry = normalize_runtime_allowlist_value(line);
        if entry.chars().count() > RUNTIME_ALLOWLIST_MAX_ENTRY_CHARS {
            return Err(format!(
                "Moderation allowlist line {} exceeds 256 characters.",
                index + 1
            ));
        }
        entries.insert(entry);
        if entries.len() > RUNTIME_ALLOWLIST_MAX_ENTRIES {
            return Err("The moderation allowlist supports at most 1,024 entries.".to_owned());
        }
    }
    Ok(entries)
}

fn normalize_runtime_allowlist_value(value: &str) -> String {
    value
        .nfkc()
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn runtime_value_is_allowed(value: &str) -> bool {
    let normalized = normalize_runtime_allowlist_value(value);
    !normalized.is_empty()
        && RUNTIME_ALLOWLIST
            .read()
            .is_ok_and(|allowlist| allowlist.entries.contains(&normalized))
}

fn clear_result_cache() {
    if let Ok(mut cache) = RESULT_CACHE.write() {
        cache.clear();
    }
}

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
    if runtime_value_is_allowed(value) {
        return false;
    }
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
    use super::{assert_safe, censor, contains_blocked_text, parse_runtime_allowlist};

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
        assert!(!contains_blocked_text("Edd"));
        assert!(!contains_blocked_text("Ed^"));
        assert!(!contains_blocked_text("GUINEOS/Hom"));
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

    #[test]
    fn runtime_allowlist_uses_exact_normalized_values() {
        let entries = parse_runtime_allowlist(
            "# local tournament decisions\nGUINEOS/Hom\n  Edd  \nTeam   Name\n",
        )
        .unwrap();
        assert!(entries.contains("guineos/hom"));
        assert!(entries.contains("edd"));
        assert!(entries.contains("team name"));
        assert!(!entries.contains("hom"));
    }
}
