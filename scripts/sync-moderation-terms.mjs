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

// Reviewed ordinary words and identity terms that appear in the broad English
// source but are unsafe to block in fighting-game identities. Excluding the
// exact standalone term does not remove longer abusive terms that contain the
// same letters. This list is identity-agnostic: it covers common names,
// brands, countries, ordinary words, and non-slur identity terms, never a
// segregated subset of identity words.
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
    .filter(Boolean);
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
// Short blocked terms cannot safely match every substring (for example, names
// such as Hitchcock). These reviewed ordinary terms may serve as the other
// half of an unseparated compound, allowing conservative word-boundary
// recovery without classifying any identity as inherently unsafe.
const safeCompoundParts = [...reviewedFalsePositives.en]
  .filter((term) => /^[\p{L}\p{N}]+$/u.test(term) && [...term].length >= 3)
  .sort((left, right) => left.localeCompare(right, 'en'));

const root = process.cwd();
const rustOutputPath = resolve(root, 'src-tauri/src/generated_moderation_terms.rs');
const terms = {};
const sourceCounts = {};
const activeCounts = {};
const digest = createHash('sha256');

// The reviewed source bundle has no Korean file. Preserve the existing pinned
// dependency-backed Korean policy in both runtimes until a reviewed ko.txt is supplied.
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
  const sourceTerms = normalizedSource
    .split('\n')
    .map((term) => term.normalize('NFKC').trim().toLocaleLowerCase())
    .filter(Boolean);
  const minimum = minimumCharacters[language];
  const activeTerms = [...new Set(sourceTerms)]
    .filter((term) => [...term.replace(/\s/gu, '')].length >= minimum)
    .filter((term) => !isReviewedFalsePositive(language, term))
    .filter((term) => {
      const distinctive = distinctiveLatinCharacters[language];
      return !distinctive || distinctive.test(term);
    })
    .filter((term) => {
      const requiredScript = requiredScriptCharacters[language];
      return !requiredScript || requiredScript.test(term);
    });
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

  sourceCounts[language] = sourceTerms.length;
  activeCounts[language] = uniqueActiveTerms.length;
  terms[language] = uniqueActiveTerms;
}

const koreanTerms = [...new Set((profaneWords.get('ko') ?? [])
  .map((term) => term.normalize('NFKC').trim().toLocaleLowerCase())
  .filter((term) => term && /\p{Script=Hangul}/u.test(term)))]
  .sort((left, right) => left.localeCompare(right, 'en'));
digest.update(`ko\0@2toad/profanity@${profanityPackage.version}\0${koreanTerms.join('\n')}\0`);
sourceCounts.ko = koreanTerms.length;
activeCounts.ko = koreanTerms.length;
terms.ko = koreanTerms;

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
  `pub const SAFE_COMPOUND_PARTS: &[&str] = &[\n${safeCompoundParts.map((term) => `    ${rustString(term)},\n`).join('')}];\n`;

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
