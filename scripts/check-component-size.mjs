import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import formatting from '../prettier.config.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const translationDirectory = join(projectRoot, 'src/renderer/src/i18n/catalogs');
const checks = [
  { root: 'src/renderer/src/ui', extensions: new Set(['.tsx']), maxLines: 700 },
  { root: 'src', extensions: new Set(['.ts']), maxLines: 700 },
  { root: 'src/renderer/src', extensions: new Set(['.css']), maxLines: 1_500 },
  { root: 'src-tauri/src', extensions: new Set(['.rs']), maxLines: 1_500 },
  { root: 'crates', extensions: new Set(['.rs']), maxLines: 650 }
];
const violations = [];

async function checkDirectory(directory, extensions, maxLines) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await checkDirectory(path, extensions, maxLines);
      continue;
    }
    if (!extensions.has(extname(entry.name)) || entry.name.startsWith('generated')) continue;

    // Translation catalogs are data. Keep one file per language regardless of its size.
    if (dirname(path) === translationDirectory) continue;

    const source = await readFile(path, 'utf8');
    // Measure JS/TS/CSS in a consistent layout so packed JSX cannot hide its size.
    // Rust retains its native source budget; Prettier does not parse Rust.
    const measured = extname(path) === '.rs' ? source : await format(source, { ...formatting, filepath: path });
    const lineCount = measured.split(/\r?\n/).length;
    if (lineCount > maxLines) {
      violations.push(`${relative(projectRoot, path)}: ${lineCount} lines (maximum ${maxLines})`);
    }
  }
}

for (const check of checks) {
  await checkDirectory(join(projectRoot, check.root), check.extensions, check.maxLines);
}

if (violations.length > 0) {
  throw new Error(`Source files exceeded their maintainability budgets:\n${violations.join('\n')}`);
}

console.log('Source maintainability budgets passed.');
