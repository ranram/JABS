import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const sourceFiles = {
  ar: 'ar.txt',
  zh: 'zh.txt',
  en: 'en.txt',
  fr: 'fr.txt',
  de: 'de.txt',
  hi: 'hi.txt',
  it: 'it.txt',
  ja: 'ja.txt',
  pt: 'pt.txt',
  ru: 'ru.txt',
  es: 'es.txt'
};

const minimumCharacters = {
  ar: 2,
  zh: 1,
  en: 3,
  fr: 3,
  de: 3,
  hi: 2,
  it: 3,
  ja: 1,
  pt: 3,
  ru: 2,
  es: 3
};

// Broad non-English Latin sources are filtered to terms that contain
// language-distinctive characters. This keeps noisy ASCII entries in upstream
// lists from blocking ordinary Latin player tags.
const distinctiveLatinCharacters = {
  fr: /[àâæçéèêëîïôœùûüÿ]/iu,
  de: /[äöüß]/iu,
  it: /[àèéìíîòóùú]/iu,
  pt: /[áâãàçéêíóôõú]/iu,
  es: /[áéíóúüñ¿¡]/iu
};

// Broad non-Latin sources sometimes contain unrelated ASCII words. Require
// the language's own script so entries such as Arabic-list "zippy" cannot
// poison ordinary Latin player tags.
const requiredScriptCharacters = {
  ar: /\p{Script=Arabic}/u,
  zh: /\p{Script=Han}/u,
  hi: /\p{Script=Devanagari}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ru: /\p{Script=Cyrillic}/u
};

// Exclude reviewed names and ordinary words from the English catalog.
// Longer blocked terms containing the same letters stay in the catalog.
const englishAllowlistPath = resolve(process.cwd(), 'scripts', 'moderation-en-allowlist.txt');
const englishAllowlistText = (await readFile(englishAllowlistPath, 'utf8')).replace(/\r\n?/gu, '\n');
const globalAllowlistText = (await readFile(
  resolve(process.cwd(), 'scripts', 'moderation-global-allowlist.txt'),
  'utf8'
)).replace(/\r\n?/gu, '\n');
function reviewedTerms(text) {
  const exactTerms = text
    .split('\n')
    .map((term) => term.normalize('NFKC').trim().toLocaleLowerCase())
    .filter(Boolean)
    .flatMap((term) => [term, term.normalize('NFKD').replace(/\p{M}/gu, '')]);
  return new Set(exactTerms.flatMap((term) => {
    if (!/[\s-]/u.test(term)) return [term];
    const joined = term.replace(/[^\p{L}\p{N}]/gu, '');
    return joined && joined !== term ? [term, joined] : [term];
  }));
}
const reviewedGlobalFalsePositives = reviewedTerms(globalAllowlistText);
const reviewedFalsePositives = {
  en: reviewedTerms(englishAllowlistText)
};
function isReviewedFalsePositive(language, term) {
  const compact = term.replace(/[^\p{L}\p{N}]/gu, '');
  return reviewedFalsePositives[language]?.has(term)
    || reviewedFalsePositives[language]?.has(compact)
    || reviewedGlobalFalsePositives.has(term)
    || reviewedGlobalFalsePositives.has(compact);
}
// A safe word exempts only its own letters. Continue checking the rest of
// the player name for blocked fragments.
const reviewedSafeWords = [...new Set([...reviewedFalsePositives.en, ...reviewedGlobalFalsePositives])]
  .filter((term) => /^[\p{L}\p{N}]+$/u.test(term) && [...term].length >= 3)
  .sort((left, right) => left.localeCompare(right, 'en'));

const root = process.cwd();
const rustOutputPath = resolve(root, 'src-tauri/src/generated_moderation_terms.rs');
const terms = {};
const protectedTerms = new Set();
const embeddedTerms = new Set();
const exactValues = new Set();
const digest = createHash('sha256');

function parseCatalogEntries(text, language, filename) {
  const entries = [];
  for (const [index, line] of text.split('\n').entries()) {
    const value = line.normalize('NFKC').trim().toLowerCase();
    if (!value || value.startsWith('#')) continue;

    const isExact = value.startsWith('=');
    const isProtected = value.startsWith('!');
    const unmarkedValue = isExact || isProtected ? value.slice(1).trim() : value;
    const isEmbedded = !isExact && unmarkedValue.startsWith('~');
    const term = isEmbedded ? unmarkedValue.slice(1).trim() : unmarkedValue;
    if (!term || /^[!~=]/u.test(term) || (isProtected && !/[\p{L}\p{N}]/u.test(term))) {
      throw new Error(`Invalid moderation entry in ${filename}:${index + 1}.`);
    }
    if (isProtected) {
      const plainTerm = term.normalize('NFKD').replace(/\p{M}/gu, '');
      const conflicts = [term, plainTerm].some((spelling) =>
        isReviewedFalsePositive(language, spelling) || isReviewedFalsePositive('en', spelling));
      if (conflicts) {
        throw new Error(`Protected moderation entry conflicts with a reviewed exclusion in ${filename}:${index + 1}.`);
      }
    }
    entries.push({ term, isProtected, isEmbedded, isExact });
  }
  return entries;
}

function includeCatalogTerm(language, term, isProtected) {
  if (isProtected) return true;
  if ([...term.replace(/\s/gu, '')].length < minimumCharacters[language]) return false;
  if (isReviewedFalsePositive(language, term)) return false;
  const distinctive = distinctiveLatinCharacters[language];
  const script = requiredScriptCharacters[language];
  return (!distinctive || distinctive.test(term)) && (!script || script.test(term));
}

// The reviewed source bundle has no Korean file. Preserve the existing pinned
// dependency-backed Korean policy until a reviewed ko.txt is supplied.
const require = createRequire(import.meta.url);
const profanityEntry = require.resolve('@2toad/profanity');
const profanityPackage = JSON.parse(
  await readFile(resolve(dirname(profanityEntry), '..', 'package.json'), 'utf8')
);
const { profaneWords } = require(join(dirname(profanityEntry), 'data', 'profane-words.js'));

digest.update(`en-allowlist\0${englishAllowlistText}\0`);
digest.update(`global-allowlist\0${globalAllowlistText}\0`);

for (const [language, source] of Object.entries(sourceFiles)) {
  const text = await readFile(resolve(root, 'bad-word-list', source), 'utf8');
  const normalizedSource = text.replace(/\r\n?/gu, '\n');
  digest.update(`${language}\0${normalizedSource}\0`);
  const sourceEntries = parseCatalogEntries(normalizedSource, language, source);
  const catalogEntries = sourceEntries.filter(({ isExact }) => !isExact);
  const sourceTerms = catalogEntries.map(({ term }) => term);
  const markedTerms = new Set(catalogEntries.filter(({ isProtected }) => isProtected).map(({ term }) => term));
  for (const term of markedTerms) protectedTerms.add(term);
  for (const { term, isEmbedded, isExact } of sourceEntries) {
    if (isEmbedded) embeddedTerms.add(term);
    if (isExact) exactValues.add(term);
  }
  const minimum = minimumCharacters[language];
  const activeTerms = [...new Set(sourceTerms)]
    .filter((term) => includeCatalogTerm(language, term, markedTerms.has(term)));
  // A reviewed phrase remains blocked when separators are removed. This derives
  // joined spellings uniformly instead of maintaining one-off concatenations in code.
  activeTerms.push(...activeTerms.flatMap((term) => {
    if (!/[\s-]/u.test(term)) return [];
    const joined = term.replace(/[^\p{L}\p{N}]/gu, '');
    return joined !== term
      && [...joined].length >= minimum
      && !isReviewedFalsePositive(language, joined)
      ? [joined]
      : [];
  }));
  const uniqueActiveTerms = [...new Set(activeTerms)]
    .sort((left, right) => left.localeCompare(right, 'en'));

  terms[language] = uniqueActiveTerms;
}

const koreanTerms = [...new Set((profaneWords.get('ko') ?? [])
  .map((term) => term.normalize('NFKC').trim().toLocaleLowerCase())
  .filter((term) => term && /\p{Script=Hangul}/u.test(term)))]
  .sort((left, right) => left.localeCompare(right, 'en'));
digest.update(`ko\0@2toad/profanity@${profanityPackage.version}\0${koreanTerms.join('\n')}\0`);
terms.ko = koreanTerms;

// An exception for a complete field must not remove the matching term from the blocked catalog.
const reviewedExactValues = [...exactValues].sort((left, right) => left.localeCompare(right, 'en'));
for (const term of protectedTerms) {
  if (reviewedExactValues.includes(term)) {
    throw new Error('A protected moderation entry conflicts with a reviewed complete-value exception.');
  }
}
const reviewedEmbeddedTerms = [...embeddedTerms].sort((left, right) => left.localeCompare(right, 'en'));
const activeTerms = new Set(Object.values(terms).flat());
for (const term of reviewedEmbeddedTerms) {
  if (!/^[\p{L}\p{N}]+$/u.test(term) || [...term].length < 3 || !activeTerms.has(term)) {
    throw new Error('Each reviewed embedded term must be an active alphanumeric moderation term of at least three characters.');
  }
}
const sourceDigest = digest.digest('hex');
function rustString(value) {
  return JSON.stringify(value).replace(/\\u([0-9a-fA-F]{4})/gu, '\\u{$1}');
}

const rustGenerated =
  '// Generated by scripts/sync-moderation-terms.mjs from reviewed files in bad-word-list/.\n' +
  '// Do not edit this file directly. Run pnpm run moderation:sync after reviewing source changes.\n' +
  `pub const SOURCE_DIGEST: &str = ${rustString(sourceDigest)};\n` +
  Object.entries(terms).map(([language, languageTerms]) =>
    `pub const ${language.toUpperCase()}: &[&str] = &[\n` +
    languageTerms.map((term) => `    ${rustString(term)},\n`).join('') +
    '];\n'
  ).join('') +
  `pub const PROTECTED_TERMS: &[&str] = &[\n${[...protectedTerms].sort((left, right) => left.localeCompare(right, 'en')).map((term) => `    ${rustString(term)},\n`).join('')}];\n` +
  `pub const REVIEWED_EMBEDDED_TERMS: &[&str] = &[\n${reviewedEmbeddedTerms.map((term) => `    ${rustString(term)},\n`).join('')}];\n` +
  `pub const REVIEWED_EXACT_VALUES: &[&str] = &[\n${reviewedExactValues.map((term) => `    ${rustString(term)},\n`).join('')}];\n` +
  `pub const REVIEWED_SAFE_WORDS: &[&str] = &[\n${reviewedSafeWords.map((term) => `    ${rustString(term)},\n`).join('')}];\n`;

if (process.argv.includes('--check')) {
  const currentRust = await readFile(rustOutputPath, 'utf8').catch(() => '');
  if (currentRust !== rustGenerated) {
    throw new Error(
      'Generated moderation terms are stale. Run pnpm run moderation:sync and review the source and generated diffs.'
    );
  }
} else {
  await writeFile(rustOutputPath, rustGenerated, 'utf8');
}
