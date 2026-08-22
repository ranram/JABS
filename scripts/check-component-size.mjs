import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const checks = [
  { root: 'src/renderer/src/ui', extensions: new Set(['.tsx']), maxLines: 650 },
  { root: 'src', extensions: new Set(['.ts']), maxLines: 650 },
  { root: 'src/renderer/src', extensions: new Set(['.css']), maxLines: 1_500 },
  { root: 'src-tauri/src', extensions: new Set(['.rs']), maxLines: 1_500 }
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

    const lineCount = (await readFile(path, 'utf8')).split(/\r?\n/).length;
    if (lineCount > maxLines) {
      violations.push(`${relative(projectRoot, path)}: ${lineCount} lines (maximum ${maxLines})`);
    }
  }
}

for (const check of checks) {
  await checkDirectory(join(projectRoot, check.root), check.extensions, check.maxLines);
}

if (violations.length > 0) {
  throw new Error(
    `Source files exceeded their maintainability budgets:\n${violations.join('\n')}`
  );
}

console.log('Source maintainability budgets passed.');
