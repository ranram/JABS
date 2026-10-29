import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { verifyVendoredGlib } from './vendored-glib.mjs';

const source = fileURLToPath(new URL('../vendor/glib', import.meta.url));

test('accepts the reviewed GLib backport and rejects restoration of the unsafe code', async () => {
  const manifest = await verifyVendoredGlib(source);
  assert.equal(manifest.advisory, 'RUSTSEC-2024-0429');
  const root = await mkdtemp(join(tmpdir(), 'jabs-glib-check-'));
  try {
    const copy = join(root, 'glib');
    await cp(source, copy, { recursive: true });
    const file = join(copy, 'src/variant_iter.rs');
    const patched = await readFile(file, 'utf8');
    await writeFile(file, patched.replace('                &mut p,', '                &p,'));
    await assert.rejects(verifyVendoredGlib(copy), /modified vendored GLib file/);
    await writeFile(file, patched);
    await writeFile(join(copy, 'JABS_PATCH.json'), '{}\n');
    await assert.rejects(verifyVendoredGlib(copy), /manifest changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
