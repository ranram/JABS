import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const manifestSha256 = '38753c4fb6774d89ca4d54d8182336035dccda9ece86be2bf94f8fdf8d536de5';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function verifyVendoredGlib(root) {
  const bytes = await readFile(join(root, 'JABS_PATCH.json'));
  if (sha256(bytes) !== manifestSha256) throw new Error('The reviewed GLib backport manifest changed.');
  const manifest = JSON.parse(bytes.toString('utf8'));
  const found = new Set();
  async function inspect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path, name + '/');
      else if (entry.isFile()) {
        if (name === 'JABS_PATCH.json') continue;
        if (!Object.hasOwn(manifest.files, name) || sha256(await readFile(path)) !== manifest.files[name]) {
          throw new Error(`Unreviewed or modified vendored GLib file: ${name}`);
        }
        found.add(name);
      } else throw new Error(`Unsupported vendored GLib entry: ${name}`);
    }
  }
  await inspect(root);
  for (const name of Object.keys(manifest.files)) {
    if (!found.has(name)) throw new Error(`Missing vendored GLib file: ${name}`);
  }
  return manifest;
}
