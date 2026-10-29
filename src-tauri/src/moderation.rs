use crate::generated_moderation_terms as terms;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, OnceLock, RwLock};
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

static ALL_TERMS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    [
        terms::EN, terms::FR, terms::DE, terms::IT, terms::PT, terms::ES,
        terms::AR, terms::ZH, terms::JA, terms::HI, terms::KO, terms::RU,
    ]
    .into_iter()
    .flat_map(|catalog| catalog.iter().copied())
    .collect()
});

static REVIEWED_SAFE_WORDS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    terms::REVIEWED_SAFE_WORDS.iter()
        .flat_map(|term| [(*term).to_owned(), fold_disguised_ascii(term)])
        .collect()
});

// Check inside longer words only for terms explicitly listed for that purpose.
// Applying this to the whole catalog would block ordinary names.
static EMBEDDED_TERMS: LazyLock<HashMap<char, Vec<String>>> = LazyLock::new(|| {
    let mut by_initial = HashMap::<char, Vec<String>>::new();
    for &term in terms::REVIEWED_EMBEDDED_TERMS {
        let mut spellings = vec![term.to_owned()];
        if let Some(stem) = term.strip_suffix('y') {
            spellings.push(format!("{stem}i"));
        }
        for spelling in spellings {
            by_initial.entry(spelling.chars().next().unwrap()).or_default().push(spelling);
        }
    }
    by_initial
});

static PROTECTED_TERMS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    terms::PROTECTED_TERMS.iter().flat_map(|term| {
        let mut spellings = moderation_spellings(&normalize_moderation_value(term));
        if terms::REVIEWED_EMBEDDED_TERMS.contains(term)
            && let Some(stem) = term.strip_suffix('y') {
            spellings.push(format!("{stem}i"));
        }
        spellings.into_iter().map(|spelling| spelling.chars()
            .filter(|character| character.is_alphanumeric()).collect::<String>())
    }).filter(|term| !term.is_empty()).collect()
});

const CHARACTER_ROSTERS_JSON: &str = include_str!("../resources/character_rosters.json");

fn known_character_names() -> &'static HashSet<String> {
    static NAMES: OnceLock<HashSet<String>> = OnceLock::new();
    NAMES.get_or_init(|| {
        let rosters: HashMap<String, Vec<String>> = serde_json::from_str(CHARACTER_ROSTERS_JSON)
            .expect("compiled character rosters must be valid");
        rosters
            .values()
            .flat_map(|characters| characters.iter())
            .map(|name| normalize_character_name(name))
            .collect()
    })
}

fn normalize_character_name(value: &str) -> String {
    value
        .replace('&', " and ")
        .nfkd()
        .filter(|character| !is_combining_mark(*character) && character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_known_character_name(value: &str) -> bool {
    let normalized = normalize_character_name(value);
    !normalized.is_empty() && known_character_names().contains(&normalized)
}

const RESULT_CACHE_LIMIT: usize = 512;
static RESULT_CACHE: LazyLock<RwLock<HashMap<String, bool>>> =
    LazyLock::new(|| RwLock::new(HashMap::with_capacity(RESULT_CACHE_LIMIT)));

const RUNTIME_ALLOWLIST_MAX_BYTES: u64 = 256 * 1024;
const RUNTIME_ALLOWLIST_MAX_ENTRIES: usize = 4_096;
const RUNTIME_ALLOWLIST_MAX_ENTRY_CHARS: usize = 256;
const RUNTIME_ALLOWLIST_TEMPLATE: &str = "# JABS moderation allowlist\n\
# Add one exact player tag, sponsor, pronoun value, or other field value per line.\n\
# Protected terms cannot be added. Other blocked values can have an exact exception.\n\
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
    apply_runtime_allowlist(entries)
}

pub fn runtime_allowlist_contents() -> Result<String, String> {
    let path = runtime_allowlist_path()?;
    ensure_runtime_allowlist_file(&path)?;
    read_allowlist_contents(&path)
}

pub fn save_runtime_allowlist(contents: &str) -> Result<usize, String> {
    if contents.len() as u64 > RUNTIME_ALLOWLIST_MAX_BYTES {
        return Err("moderation.fileTooLarge".to_owned());
    }
    let entries = parse_runtime_allowlist(contents)?;
    let path = runtime_allowlist_path()?;
    ensure_runtime_allowlist_file(&path)?;
    std::fs::write(path, contents)
        .map_err(|_| "JABS could not save the moderation allowlist.".to_owned())?;
    apply_runtime_allowlist(entries)
}

fn apply_runtime_allowlist(entries: HashSet<String>) -> Result<usize, String> {
    let count = entries.len();
    let mut allowlist = RUNTIME_ALLOWLIST
        .write()
        .map_err(|_| "The moderation allowlist is unavailable.".to_owned())?;
    allowlist.entries = entries;
    // Update the allowlist and cached results together so readers cannot mix old and new rules.
    clear_result_cache();
    Ok(count)
}

fn runtime_allowlist_path() -> Result<PathBuf, String> {
    RUNTIME_ALLOWLIST
        .read()
        .map_err(|_| "The moderation allowlist is unavailable.".to_owned())?
        .path
        .clone()
        .ok_or_else(|| "The moderation allowlist has not been initialized.".to_owned())
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
    parse_runtime_allowlist(&read_allowlist_contents(path)?)
}

fn read_allowlist_contents(path: &Path) -> Result<String, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|_| "JABS could not read the moderation allowlist.".to_owned())?;
    if metadata.len() > RUNTIME_ALLOWLIST_MAX_BYTES {
        return Err("moderation.fileTooLarge".to_owned());
    }
    std::fs::read_to_string(path)
        .map_err(|_| "The moderation allowlist must be valid UTF-8 text.".to_owned())
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
            return Err(format!("moderation.lineTooLong|{}", index + 1));
        }
        // Protection is checked without the active allowlist or its cache.
        if moderation_spellings(&normalize_moderation_value(line)).iter()
            .any(|candidate| protected_candidate_is_blocked(candidate)) {
            return Err(format!("moderation.protectedEntry|{}", index + 1));
        }
        entries.insert(entry);
        if entries.len() > RUNTIME_ALLOWLIST_MAX_ENTRIES {
            return Err("moderation.tooManyEntries".to_owned());
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

fn value_is_allowed(value: &str, entries: &HashSet<String>) -> bool {
    if entries.is_empty() { return false; }
    let normalized = normalize_runtime_allowlist_value(value);
    !normalized.is_empty() && entries.contains(&normalized)
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

/// Censors a character selection while preserving reviewed roster names such as
/// "Banjo and Kazooie" that should not require per-tournament allowlist entries.
pub fn censor_character(value: Option<String>) -> Option<String> {
    value.map(|value| {
        if is_known_character_name(&value) || !contains_blocked_text(&value) {
            value
        } else {
            "[blocked]".to_owned()
        }
    })
}

/// Checks character selections for blocked text, exempting reviewed roster names.
pub fn contains_blocked_text_for_character(value: &str) -> bool {
    !is_known_character_name(value) && contains_blocked_text(value)
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
    // Keep the allowlist locked until the result is cached, so reloading it
    // cannot leave behind a result checked against the old list.
    let allowlist = RUNTIME_ALLOWLIST.read();
    if let Ok(cache) = RESULT_CACHE.read()
        && let Some(blocked) = cache.get(value)
    {
        return *blocked;
    }
    let blocked = match &allowlist {
        Ok(allowlist) => moderation_candidates_are_blocked(value, &allowlist.entries),
        Err(_) => moderation_candidates_are_blocked(value, &HashSet::new()),
    };
    if let Ok(mut cache) = RESULT_CACHE.write() {
        if cache.len() >= RESULT_CACHE_LIMIT {
            cache.clear();
        }
        cache.insert(value.to_owned(), blocked);
    }
    drop(allowlist);
    blocked
}

fn moderation_candidates_are_blocked(value: &str, entries: &HashSet<String>) -> bool {
    let lower = normalize_moderation_value(value);
    let candidates = moderation_spellings(&lower);
    // Check protected terms before applying the allowlist. A longer name that
    // only contains a blocked fragment can still be allowed.
    if candidates.iter().any(|candidate| protected_candidate_is_blocked(candidate)) { return true; }
    if value_is_allowed(value, entries) { return false; }
    if terms::REVIEWED_EXACT_VALUES.contains(&lower.trim()) { return false; }
    if REVIEWED_SAFE_WORDS.contains(lower.trim()) { return false; }
    candidates.iter().any(|candidate| candidate_is_blocked(candidate))
}

fn normalize_moderation_value(value: &str) -> String {
    // Strip invisible separators used to disguise words. Keep visible spaces
    // and punctuation as word boundaries.
    value.nfkc().filter(|character| !matches!(character,
        '\u{ad}' | '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{2060}' | '\u{feff}'
    )).collect::<String>().to_lowercase()
}

fn moderation_spellings(lower: &str) -> Vec<String> {
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
    let mut candidates = vec![lower.to_owned()];
    // Apply wildcard recovery after lookalike/accent folding as well, so
    // combining two disguises cannot bypass either moderation or protection.
    for spelling in [leetspeak.clone(), fold_disguised_ascii(&leetspeak)] {
        candidates.push(spelling.clone());
        candidates.push(collapse_repeats(&spelling));
        if spelling.contains(['*', '＊']) {
            for vowel in ['a', 'e', 'i', 'o', 'u'] {
                candidates.push(spelling.replace(['*', '＊'], &vowel.to_string()));
            }
        }
    }
    let mut seen = HashSet::with_capacity(candidates.len());
    candidates.retain(|candidate| seen.insert(candidate.clone()));
    candidates
}

fn protected_candidate_is_blocked(candidate: &str) -> bool {
    let words = restore_spelled_words(candidate);
    for start in 0..words.len() {
        // Extend only prefixes of actual protected terms. This handles spaced
        // and repeated-letter phrases without a guessed maximum input length.
        let mut possible_terms = PROTECTED_TERMS.iter().collect::<Vec<_>>();
        let mut spelling = String::new();
        for word in words.iter().skip(start) {
            spelling.push_str(word);
            if PROTECTED_TERMS.contains(&spelling) { return true; }
            let mut complete = false;
            possible_terms.retain(|term| match match_repeated_letters(&spelling, term) {
                SpellingMatch::Different => false,
                SpellingMatch::Prefix => true,
                SpellingMatch::Complete => { complete = true; true },
            });
            if complete { return true; }
            if possible_terms.is_empty() { break; }
        }
    }
    false
}

enum SpellingMatch { Different, Prefix, Complete }

fn match_repeated_letters(value: &str, term: &str) -> SpellingMatch {
    let mut actual = value.chars().peekable();
    let mut expected = term.chars().peekable();
    while let Some(character) = expected.next() {
        let mut required = 1;
        while expected.peek() == Some(&character) {
            expected.next();
            required += 1;
        }
        let mut observed = 0;
        while actual.peek() == Some(&character) {
            actual.next();
            observed += 1;
        }
        // Extra repeated letters can disguise a term; missing a required
        // letter must not turn an ordinary word such as Niger into a slur.
        if observed < required {
            return if actual.peek().is_none() { SpellingMatch::Prefix } else { SpellingMatch::Different };
        }
    }
    if actual.peek().is_none() { SpellingMatch::Complete } else { SpellingMatch::Different }
}

fn candidate_is_blocked(candidate: &str) -> bool {
    let words = restore_spelled_words(candidate);
    if ALL_TERMS.contains(candidate.trim())
        || words.iter().any(|word| ALL_TERMS.contains(word.as_str()))
    {
        return true;
    }
    for start in 0..words.len() {
        let mut phrase = String::new();
        for (offset, word) in words.iter().skip(start).take(8).enumerate() {
            if !phrase.is_empty() { phrase.push(' '); }
            phrase.push_str(word);
            if offset > 0 && ALL_TERMS.contains(phrase.as_str()) {
                return true;
            }
        }
    }
    // Check joined words only against the explicitly listed fragments;
    // joining every phrase would block legitimate names.
    let compact = words.concat();
    embedded_term_is_blocked(&compact)
}

fn restore_spelled_words(candidate: &str) -> Vec<String> {
    // Reconstruct the entire run before matching: "a s s e s s" is an
    // ordinary word, not a blocked three-letter prefix followed by padding.
    // Non-Latin single-character words retain their own catalog boundaries.
    let mut words = Vec::new();
    let mut spelling = String::new();
    for word in candidate.split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty()) {
        if word.len() == 1 && word.as_bytes()[0].is_ascii_alphabetic() {
            spelling.push_str(word);
        } else {
            if !spelling.is_empty() { words.push(std::mem::take(&mut spelling)); }
            if !word.is_empty() { words.push(word.to_owned()); }
        }
    }
    if !spelling.is_empty() { words.push(spelling); }
    words
}

fn embedded_term_is_blocked(token: &str) -> bool {
    if REVIEWED_SAFE_WORDS.contains(token) { return false; }
    token.char_indices().any(|(start, initial)| {
        EMBEDDED_TERMS.get(&initial).is_some_and(|terms| {
            terms.iter().any(|term| {
                token[start..].starts_with(term.as_str())
                    && !reviewed_safe_occurrence(token, start, start + term.len())
            })
        })
    })
}

// Exempt the occurrence inside an ordinary reviewed word, not the entire tag:
// another blocked term elsewhere in a name such as SpicyPlayer is still checked.
fn reviewed_safe_occurrence(token: &str, start: usize, end: usize) -> bool {
    REVIEWED_SAFE_WORDS.iter().any(|safe| {
        safe.len() > end - start && token.match_indices(safe.as_str()).any(|(safe_start, _)| {
            safe_start <= start && end <= safe_start + safe.len()
        })
    })
}

fn fold_disguised_ascii(value: &str) -> String {
    value.nfkd().filter(|character| !is_combining_mark(*character)).map(|character| {
        match character {
            // Common Cyrillic and Greek lookalikes, after case normalization.
            '\u{430}' | '\u{3b1}' => 'a',
            '\u{441}' => 'c',
            '\u{435}' | '\u{3b5}' => 'e',
            '\u{456}' | '\u{3b9}' => 'i',
            '\u{458}' => 'j',
            '\u{43a}' | '\u{3ba}' => 'k',
            '\u{43e}' | '\u{3bf}' => 'o',
            '\u{440}' | '\u{3c1}' => 'p',
            '\u{455}' => 's',
            '\u{3c4}' => 't',
            '\u{3c5}' => 'u',
            '\u{3bd}' => 'v',
            '\u{445}' | '\u{3c7}' => 'x',
            '\u{443}' => 'y',
            other => other,
        }
    }).collect()
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
    use super::{
        assert_safe, censor, censor_character, contains_blocked_text,
        contains_blocked_text_for_character, parse_runtime_allowlist,
    };

    #[test]
    fn ordinary_blocked_values_accept_exact_allowlist_exceptions() {
        for value in ["Hell", "Hells", "HELLS"] {
            assert!(!super::moderation_candidates_are_blocked(value, &std::collections::HashSet::new()));
        }
        let entries = parse_runtime_allowlist("Randy\n").unwrap();
        assert!(super::moderation_candidates_are_blocked("Randy", &std::collections::HashSet::new()));
        for value in ["Randy", "RANDY", "  Randy  "] {
            assert!(!super::moderation_candidates_are_blocked(value, &entries));
        }
        assert!(super::moderation_candidates_are_blocked("Team Randy", &entries));
    }

    // Escaped fixtures test blocked spellings without displaying slurs in the source.
    #[test]
    fn blocks_reviewed_slur_obfuscation_without_common_tag_false_positive() {
        let embedded = "superamazing\u{6e}\u{69}\u{67}\u{67}\u{65}\u{72}\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}man";
        for term in [
            "\u{66}\u{61}\u{67}",
            "\u{66}\u{75}\u{63}\u{6b}",
            "\u{6e}\u{69}\u{67}\u{67}\u{61}",
            "\u{62}\u{69}\u{74}\u{63}\u{68}",
        ] {
            assert!(contains_blocked_text(&format!("prefix{term}suffix")));
        }
        assert!(contains_blocked_text("prefix\u{66}\u{fa}\u{63}\u{6b}suffix"));
        assert!(contains_blocked_text("prefix\u{66}\u{75}\u{441}\u{6b}suffix"));
        assert!(contains_blocked_text("prefix\u{66}\u{3c5}\u{63}\u{6b}suffix"));
        assert!(contains_blocked_text(embedded));
        assert!(contains_blocked_text(&embedded.to_uppercase()));
        for term in [
            "\u{6e}\u{69}\u{67}\u{67}\u{65}\u{72}",
            "\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}",
            "\u{6e}1\u{67}\u{67}3\u{72}",
            "\u{66}@\u{67}\u{67}0\u{74}",
            "\u{66}\u{61}\u{200b}\u{67}\u{67}\u{6f}\u{74}",
        ] {
            assert!(contains_blocked_text(&format!("prefix{term}suffix")));
        }
        assert!(contains_blocked_text("\u{47}\u{41}\u{59}\u{46}\u{41}\u{47}\u{47}\u{4f}\u{54}"));
        assert!(contains_blocked_text("\u{48}\u{65}\u{6c}\u{6c}\u{6f}\u{46}\u{41}\u{47}"));
        assert!(contains_blocked_text("\u{67}\u{61}\u{79}\u{66}\u{40}\u{67}\u{67}\u{6f}\u{74}"));
        assert!(contains_blocked_text("\u{66}\u{61}\u{20}\u{67}\u{67}\u{6f}\u{74}"));
        assert!(contains_blocked_text("\u{66}\u{75}\u{2d}\u{63}\u{6b}"));
        assert!(contains_blocked_text("\u{74}\u{72}\u{61}\u{6e}\u{6e}\u{69}\u{65}\u{70}\u{6f}\u{77}\u{65}\u{72}"));
        assert!(contains_blocked_text("\u{54}\u{72}\u{61}\u{6e}\u{6e}\u{69}\u{65}\u{50}\u{6f}\u{77}\u{65}\u{72}"));
        assert!(contains_blocked_text("\u{74}\u{72}\u{40}\u{6e}\u{6e}\u{79}"));
        assert!(contains_blocked_text("\u{74}\u{72}\u{61}\u{6e}\u{6e}\u{69}"));
        assert!(contains_blocked_text("\u{74}\u{72}\u{61}\u{6e}\u{6e}\u{69}\u{70}\u{6f}\u{77}\u{65}\u{72}"));
        assert!(contains_blocked_text("\u{73}\u{75}\u{70}\u{65}\u{72}\u{70}\u{6f}\u{72}\u{6e}"));
        assert!(contains_blocked_text("\u{65}\u{6e}\u{63}\u{75}\u{6c}\u{e9}"));
        assert!(contains_blocked_text("\u{73}\u{63}\u{68}\u{65}\u{69}\u{df}\u{65}"));
        assert!(contains_blocked_text("\u{63}\u{6f}\u{f1}\u{6f}"));
        assert!(contains_blocked_text("\u{63}\u{61}\u{62}\u{72}\u{f3}\u{6e}"));
        // Ambiguous short fragments require actual word boundaries. They remain
        // blocked on their own and when deliberately written one letter at a time.
        for term in [
            "\u{73}\u{68}\u{69}\u{74}", "\u{73}\u{70}\u{69}\u{63}",
            "\u{63}\u{68}\u{69}\u{6e}\u{6b}", "\u{6b}\u{69}\u{6b}\u{65}",
        ] {
            assert!(contains_blocked_text(term));
            assert!(contains_blocked_text(&format!("Player / {term}")));
            let spaced = term.chars().map(|letter| letter.to_string()).collect::<Vec<_>>().join(" ");
            assert!(contains_blocked_text(&format!("Player {spaced}")));
        }
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
            "Funda Series",
            "Attack",
            "First Attack",
            "First Attack 2026",
            "FirstAttack",
            "Counter Attack",
            "assessment", "assess", "passing", "spacing", "classical", "Dickson",
            "Nishitani", "NISHITANI", "nishitani", "Charlotta", "Barbarian",
            "Li Mei", "Li-Mei", "Li/Mei", "Li | Mei", "Li. Mei", "Yuri Sakazaki",
            "Duck Hunt", "G8S/HitBox Player", "a s s e s s", "p a s s i n g",
        ] {
            assert!(!contains_blocked_text(value), "ordinary tournament text was blocked: {value}");
        }
        assert!(contains_blocked_text("First Attack \u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}"));
        assert!(!contains_blocked_text("assistant"));
        assert!(!contains_blocked_text("classic"));
        for name in [
            "SpicyPlayer", "Spicer", "PachinkoPlayer", "Scunthorpe", "Pride",
            "Hitchcock", "HitchCock", "Yamashita", "Yoshitaka",
            "YAS", "yas", "YaS", "REJECT | YAS", "YAS vs AngryBird",
            "EbrahimTNT", "ebrahimtnt", "fubarduck", "FubarDuck",
            "G8S", "GAS", "G8S (Good 8 Squad)", "G8S/HitBox", "g8s/hitbox",
            "NIP", "nip", "  NIP  ", "ＮＩＰ", "NIP/ATG", "nip/atg", "小路KOG",
        ] {
            assert!(!contains_blocked_text(name), "ordinary name was blocked: {name}");
        }
        for name in ["EbrahimTNT", "fubarduck", "G8S/HitBox", "NIP", "NIP/ATG"] {
            assert!(contains_blocked_text(&format!("{name}\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}")));
        }
        for term in ["tnt", "yasf"] {
            assert!(contains_blocked_text(term), "unreviewed value was allowed: {term}");
        }
        assert!(contains_blocked_text("YAS\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}"));
        assert!(contains_blocked_text("yasf"));
        assert!(contains_blocked_text("SpicyPlayer\u{66}\u{61}\u{67}"));
        assert!(!contains_blocked_text("Hitchcock"));
        assert!(!contains_blocked_text("Guadalcanal"));
        assert!(!contains_blocked_text("cocktail"));
        assert!(contains_blocked_text("\u{62}\u{65}\u{61}\u{73}\u{74}\u{69}\u{61}\u{6c}\u{69}\u{74}\u{79}"));
        assert!(contains_blocked_text("\u{69}\u{46}\u{61}\u{67}"));
        assert!(!contains_blocked_text("iPodTouch"));
        assert_eq!(censor(Some("\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}".to_owned())).as_deref(), Some("[blocked]"));
        assert!(!contains_blocked_text_for_character("Banjo and Kazooie"));
        assert!(!contains_blocked_text_for_character("Banjo & Kazooie"));
        assert_eq!(
            censor_character(Some("Banjo and Kazooie".to_owned())).as_deref(),
            Some("Banjo and Kazooie")
        );
        // Offensive text that is not a known character name is still blocked.
        assert!(contains_blocked_text_for_character("\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}"));
        assert_eq!(
            censor_character(Some("\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}".to_owned())).as_deref(),
            Some("[blocked]")
        );
    }


    #[test]
    fn blocked_pronouns_never_commit_or_broadcast_and_valid_edits_still_save() {
        use crate::{database::Database, state::{OverlayStore, UpdateSelectedSetError}};
        let unused = std::path::Path::new("unused");
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let mut updates = store.subscribe();
        let before = store.current().unwrap();
        let saved = database.load_overlay_state().unwrap();
        let blocked = "superamazing\u{6e}\u{69}\u{67}\u{67}\u{65}\u{72}\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}man";
        for side in ["one", "two"] {
            let mut selected = store.selected_set().unwrap();
            let player = if side == "one" { &mut selected.player_one } else { &mut selected.player_two };
            player.pronouns = Some(blocked.to_owned());
            let Err(UpdateSelectedSetError::Invalid(error)) =
                store.update_selected_set(&database, unused, unused, selected.clone())
            else { panic!("blocked pronouns were not rejected"); };
            assert!(error.contains(&format!("Player {side} pronouns")));
            assert!(!error.contains(blocked));
            assert!(store.replace_selected_set(&database, unused, unused, selected).is_err());
            assert_eq!(store.current().unwrap(), before);
            assert_eq!(database.load_overlay_state().unwrap(), saved);
            assert!(matches!(updates.try_recv(), Err(tokio::sync::broadcast::error::TryRecvError::Empty)));
        }
        let mut selected = store.selected_set().unwrap();
        selected.player_one.pronouns = Some("they/them".to_owned());
        selected.player_two.pronouns = Some("he/him".to_owned());
        let committed = store.update_selected_set(&database, unused, unused, selected).unwrap();
        assert_eq!(committed["selectedSet"]["playerOne"]["pronouns"], "they/them");
        assert_eq!(committed["selectedSet"]["playerTwo"]["pronouns"], "he/him");
        let persisted: serde_json::Value = serde_json::from_str(&database.load_overlay_state().unwrap().unwrap()).unwrap();
        let broadcast: serde_json::Value = serde_json::from_str(&updates.try_recv().unwrap()).unwrap();
        assert_eq!(persisted, committed);
        assert_eq!(broadcast, committed);
    }

    #[test]
    fn restoring_previously_saved_blocked_text_censors_only_the_offending_fields() {
        use crate::{database::Database, state::OverlayStore};
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let mut legacy = store.current().unwrap();
        let blocked = "prefix\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}suffix";
        legacy["selectedSet"]["playerOne"]["pronouns"] = blocked.into();
        legacy["selectedSet"]["playerTwo"]["pronouns"] = "she/her".into();
        legacy["selectedSet"]["playerOne"]["score"] = 1.into();
        legacy["selectedSet"].as_object_mut().unwrap().remove("gameHistory");
        database.save_overlay_state(&legacy.to_string(), "fixture").unwrap();
        let restored_store = OverlayStore::load(&database).unwrap();
        let restored = restored_store.current().unwrap();
        legacy["selectedSet"]["playerOne"]["pronouns"] = "[blocked]".into();
        assert_eq!(restored, legacy);
        let persisted: serde_json::Value = serde_json::from_str(&database.load_overlay_state().unwrap().unwrap()).unwrap();
        assert_eq!(persisted, restored);
        let mut updates = restored_store.subscribe();
        let mut corrected = restored_store.selected_set().unwrap();
        corrected.player_one.pronouns = None;
        let unused = std::path::Path::new("unused");
        let next = restored_store.update_selected_set(&database, unused, unused, corrected).unwrap();
        assert!(next["selectedSet"]["playerOne"]["pronouns"].is_null());
        assert_eq!(next["selectedSet"]["playerOne"]["score"], 1);
        let broadcast: serde_json::Value = serde_json::from_str(&updates.try_recv().unwrap()).unwrap();
        assert_eq!(broadcast, next);
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
        let error = assert_safe(&[("playerOne.pronouns", Some("\u{74}\u{72}\u{40}\u{6e}\u{6e}\u{79}"))]).unwrap_err();
        assert!(error.contains("playerOne.pronouns"));
        assert!(!error.contains("\u{74}\u{72}\u{40}\u{6e}\u{6e}\u{79}"));
        for blocked in [
            "\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}",
            "\u{66}\u{40}\u{67}\u{67}\u{6f}\u{74}",
            "\u{66}\u{fa}\u{63}\u{6b}",
            "\u{66}\u{61}\u{20}\u{67}\u{67}\u{6f}\u{74}",
            "\u{ff46}\u{ff41}\u{ff47}\u{ff47}\u{ff4f}\u{ff54}",
            "\u{66}\u{61}\u{200b}\u{67}\u{67}\u{6f}\u{74}",
            "\u{66}*\u{63}\u{6b}",
            "Player / \u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}",
            // Mixed disguises must be checked together.
            "\u{66}*\u{e7}\u{6b}",
            "\u{6b}*\u{6c}\u{6c} \u{79}\u{43e}\u{75}\u{72}\u{73}\u{65}\u{6c}\u{66}",
            // English compounds, plurals, and alternate spellings.
            "\u{6d}\u{6f}\u{74}\u{68}\u{65}\u{72}\u{66}\u{75}\u{63}\u{6b}\u{65}\u{72}",
            "\u{63}\u{6f}\u{63}\u{6b}\u{73}\u{75}\u{63}\u{6b}\u{65}\u{72}",
            "\u{64}\u{69}\u{63}\u{6b}\u{68}\u{65}\u{61}\u{64}",
            "\u{6b}\u{69}\u{6c}\u{6c} \u{79}\u{6f}\u{75}\u{72}\u{73}\u{65}\u{6c}\u{66}",
            "\u{6d}\u{6f}\u{74}\u{68}\u{65}\u{72}\u{66}\u{75}\u{63}\u{6b}\u{65}\u{72}\u{73}",
            "\u{63}\u{6f}\u{63}\u{6b}\u{73}\u{75}\u{63}\u{6b}\u{65}\u{72}\u{73}",
            "\u{64}\u{69}\u{63}\u{6b}\u{68}\u{65}\u{61}\u{64}\u{73}",
            "\u{62}\u{69}\u{74}\u{63}\u{68}\u{65}\u{73}",
            "\u{63}\u{68}\u{69}\u{6e}\u{6b}\u{73}",
            "\u{63}\u{75}\u{6e}\u{74}\u{73}",
            "\u{66}\u{61}\u{67}\u{73}",
            "\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}\u{73}",
            "\u{66}\u{75}\u{63}\u{6b}\u{73}",
            "\u{6b}\u{69}\u{6b}\u{65}\u{73}",
            "\u{6e}\u{69}\u{67}\u{67}\u{61}\u{73}",
            "\u{6e}\u{69}\u{67}\u{67}\u{65}\u{72}\u{73}",
            "\u{73}\u{68}\u{69}\u{74}\u{73}",
            "\u{73}\u{70}\u{69}\u{63}\u{73}",
            "\u{6e}\u{69}\u{67}\u{67}\u{61}\u{68}",
            "\u{6e}\u{69}\u{67}\u{67}\u{61}\u{68}\u{73}",
            "\u{6e}\u{69}\u{67}\u{67}\u{61}\u{7a}",
            "\u{6b}\u{61}\u{66}\u{66}\u{69}\u{72}",
            "\u{6b}\u{61}\u{66}\u{66}\u{69}\u{72}\u{73}",
            "\u{70}\u{69}\u{63}\u{61}\u{6e}\u{69}\u{6e}\u{6e}\u{79}",
            "\u{70}\u{69}\u{63}\u{61}\u{6e}\u{69}\u{6e}\u{6e}\u{69}\u{65}\u{73}",
            "\u{70}\u{69}\u{63}\u{63}\u{61}\u{6e}\u{69}\u{6e}\u{6e}\u{79}",
            "\u{70}\u{69}\u{63}\u{63}\u{61}\u{6e}\u{69}\u{6e}\u{6e}\u{69}\u{65}\u{73}",
            "\u{6e}\u{69}\u{74}\u{63}\u{68}\u{69}\u{65}",
            "\u{6e}\u{69}\u{74}\u{63}\u{68}\u{69}\u{65}\u{73}",
            "\u{73}\u{68}\u{65}\u{65}\u{6e}\u{65}\u{79}",
            "\u{73}\u{68}\u{65}\u{65}\u{6e}\u{65}\u{79}\u{73}",
            "\u{73}\u{68}\u{65}\u{65}\u{6e}\u{69}\u{65}",
            "\u{62}\u{6f}\u{6f}\u{6e}\u{67}\u{61}",
            "\u{62}\u{6f}\u{6f}\u{6e}\u{67}\u{61}\u{73}",
            // Spanish.
            "\u{63}\u{68}\u{69}\u{6e}\u{67}\u{61} \u{74}\u{75} \u{6d}\u{61}\u{64}\u{72}\u{65}",
            "\u{68}\u{69}\u{6a}\u{6f}\u{73} \u{64}\u{65} \u{70}\u{75}\u{74}\u{61}",
            "\u{67}\u{69}\u{6c}\u{69}\u{70}\u{6f}\u{6c}\u{6c}\u{61}\u{73}",
            // French.
            "\u{66}\u{69}\u{6c}\u{73} \u{64}\u{65} \u{70}\u{75}\u{74}\u{65}",
            "\u{76}\u{61} \u{74}\u{65} \u{66}\u{61}\u{69}\u{72}\u{65} \u{66}\u{6f}\u{75}\u{74}\u{72}\u{65}",
            // German.
            "\u{68}\u{75}\u{72}\u{65}\u{6e}\u{73}\u{6f}\u{68}\u{6e}",
            "\u{66}\u{69}\u{63}\u{6b} \u{64}\u{69}\u{63}\u{68}",
            // Italian.
            "\u{76}\u{61}\u{66}\u{66}\u{61}\u{6e}\u{63}\u{75}\u{6c}\u{6f}",
            "\u{66}\u{69}\u{67}\u{6c}\u{69}\u{6f} \u{64}\u{69} \u{70}\u{75}\u{74}\u{74}\u{61}\u{6e}\u{61}",
            // Portuguese.
            "\u{66}\u{69}\u{6c}\u{68}\u{6f} \u{64}\u{61} \u{70}\u{75}\u{74}\u{61}",
            "\u{76}\u{61}\u{69} \u{73}\u{65} \u{66}\u{6f}\u{64}\u{65}\u{72}",
        ] {
            assert!(contains_blocked_text(blocked));
            let joined = blocked.split_whitespace().collect::<String>();
            assert_eq!(parse_runtime_allowlist(&joined).unwrap_err(), "moderation.protectedEntry|1");
            let contents = format!("# reviewed entries\nG8S/HitBox\n{blocked}\n");
            let error = parse_runtime_allowlist(&contents).unwrap_err();
            assert_eq!(error, "moderation.protectedEntry|3");
            assert!(!error.contains(blocked));
            // Rejection happens before looking up the destination or writing a file.
            assert_eq!(super::save_runtime_allowlist(&contents).unwrap_err(), error);
        }
        let protected = "\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}";
        let stretched = protected.chars().map(|letter| letter.to_string().repeat(3)).collect::<String>();
        assert_eq!(parse_runtime_allowlist(&stretched).unwrap_err(), "moderation.protectedEntry|1");
        let phrase = "\u{6b}\u{69}\u{6c}\u{6c} \u{79}\u{6f}\u{75}\u{72}\u{73}\u{65}\u{6c}\u{66}";
        let stretched_phrase = phrase.chars().map(|letter| {
            if letter.is_whitespace() { letter.to_string() } else { letter.to_string().repeat(3) }
        }).collect::<String>();
        assert!(contains_blocked_text(&stretched_phrase));
        assert_eq!(parse_runtime_allowlist(&stretched_phrase).unwrap_err(), "moderation.protectedEntry|1");
        let entries = parse_runtime_allowlist(
            "# approved names\nGUINEOS/Hom\n  Edd  \nTeam   Name\nFunda\nG8S/HitBox\nNIP\nRandy\nTNT\nleafage\nNiger\nFilho de Deus\nFils de famille\nMadre\nFiglio\n",
        )
        .unwrap();
        assert!(entries.contains("guineos/hom"));
        assert!(entries.contains("edd"));
        assert!(entries.contains("team name"));
        assert!(!entries.contains("hom"));
        assert!(!super::value_is_allowed("Funda Series", &entries));
        assert!(!super::moderation_candidates_are_blocked("  TEAM   NAME  ", &entries));
        for value in ["Randy", "TNT", "leafage"] {
            assert!(contains_blocked_text(value));
            assert!(!super::moderation_candidates_are_blocked(value, &entries));
            assert!(super::moderation_candidates_are_blocked(&format!("Player {value}"), &entries));
            assert!(super::moderation_candidates_are_blocked(
                &format!("{value} / \u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}"), &entries));
        }
        let blocked = "\u{66}\u{61}\u{67}\u{67}\u{6f}\u{74}";
        // Protected whole terms stay blocked even if an old in-memory entry
        // was supplied without the current parser.
        let exact = std::collections::HashSet::from([blocked.to_owned()]);
        assert!(super::moderation_candidates_are_blocked(blocked, &exact));
        assert!(super::moderation_candidates_are_blocked(&format!("Player {blocked}"), &exact));
        let path = std::env::temp_dir().join(format!("jabs-allowlist-{}-{}.txt",
            std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::write(&path, "Funda\n\u{66}\u{40}\u{67}\u{67}\u{6f}\u{74}\n").unwrap();
        let reloaded = super::read_runtime_allowlist(&path);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(reloaded.unwrap_err(), "moderation.protectedEntry|2");

        // Exercise actual save/reload and cache invalidation using a unique
        // field value, so parallel moderation tests keep their normal policy.
        let value = format!("operator{}leafage", std::process::id());
        assert!(contains_blocked_text(&value));
        let previous = std::mem::take(&mut *super::RUNTIME_ALLOWLIST.write().unwrap());
        super::initialize_runtime_allowlist(path.clone()).unwrap();
        let contents = format!("# operator correction\n{value}\n");
        super::save_runtime_allowlist(&contents).unwrap();
        assert!(!contains_blocked_text(&value));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
        let invalid = format!("{contents}{blocked}\n");
        assert_eq!(super::save_runtime_allowlist(&invalid).unwrap_err(), "moderation.protectedEntry|3");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
        assert!(!contains_blocked_text(&value));
        std::fs::write(&path, invalid).unwrap();
        assert_eq!(super::reload_runtime_allowlist().unwrap_err(), "moderation.protectedEntry|3");
        assert!(!contains_blocked_text(&value));
        super::save_runtime_allowlist("# correction removed\n").unwrap();
        assert!(contains_blocked_text(&value));
        super::save_runtime_allowlist(&contents).unwrap();
        assert!(!contains_blocked_text(&value));
        {
            let mut active = super::RUNTIME_ALLOWLIST.write().unwrap();
            *active = previous;
            super::clear_result_cache();
        }
        std::fs::remove_file(path).unwrap();
    }
}
