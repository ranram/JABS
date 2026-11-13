import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tauri = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const cargo = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const installerPath = 'windows/installer.nsi'
if (tauri.bundle.windows?.nsis?.template !== installerPath) {
  throw new Error('Windows builds must use the JABS installer that preserves application data.')
}
const installer = await readFile(new URL(`../src-tauri/${installerPath}`, import.meta.url))
// Review the preserved-data behavior before changing this template or upgrading the CLI.
const installerHash = '5bfb62544e7ceb9da1d5358e0a23b26e75b3d9f4ee3f91dbdff908f6104b2bdf'
if (
  packageJson.devDependencies['@tauri-apps/cli'] !== '2.11.4' ||
  createHash('sha256').update(installer).digest('hex') !== installerHash
) {
  throw new Error('Review Windows data preservation before changing the installer or Tauri CLI. See src-tauri/windows/README.md.')
}
const nativeVersion = cargo.match(/\[package\][\s\S]*?^version = "([^"]+)"/m)?.[1];
if (packageJson.version !== tauri.version || packageJson.version !== nativeVersion) {
  throw new Error('Keep package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml versions equal.');
}
const tag = process.env.JABS_RELEASE_TAG;
if (tag && tag !== `v${packageJson.version}`) {
  throw new Error(`The release tag must be v${packageJson.version}, matching the committed app version.`);
}
const prepareUpdater = process.argv.includes('--prepare-updater');
if (process.argv.includes('--signed') || prepareUpdater) {
  if (!process.env.JABS_UPDATER_PUBLIC_KEY?.trim()) {
    throw new Error('Set the JABS_UPDATER_PUBLIC_KEY repository variable before building an update release.');
  }
  const publicKey = process.env.JABS_UPDATER_PUBLIC_KEY.trim();
  const decoded = Buffer.from(publicKey, 'base64').toString('utf8');
  const keyLine = decoded.split(/\r?\n/)[1] ?? '';
  const keyBytes = Buffer.from(keyLine, 'base64');
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey) ||
    keyBytes.length !== 42 ||
    keyBytes[0] !== 0x45 ||
    ![0x64, 0x44].includes(keyBytes[1])
  ) {
    throw new Error('JABS_UPDATER_PUBLIC_KEY must contain the generated .pub file contents, not a path.');
  }
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    throw new Error('Set the TAURI_SIGNING_PRIVATE_KEY Actions secret before building an update release.');
  }
  if (prepareUpdater) {
    // The bundler reads this config separately from the key embedded by Rust.
    tauri.plugins.updater.pubkey = publicKey;
    await writeFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), `${JSON.stringify(tauri, null, 2)}\n`);
    console.log('Configured the updater public key for Tauri packaging.');
  }
}
console.log(`Application version ${packageJson.version} and release configuration passed.`);
