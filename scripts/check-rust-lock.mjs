import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyVendoredGlib } from "./vendored-glib.mjs";

const lockfilePath = resolve(process.cwd(), "src-tauri", "Cargo.lock");
const lockfile = await readFile(lockfilePath, "utf8").catch((error) => {
  throw new Error(`Cannot read the committed Rust lockfile at ${lockfilePath}.`, {
    cause: error,
  });
});

if (!/^version = 4$/m.test(lockfile)) {
  throw new Error("JABS requires a Cargo v4 lockfile; regenerate and review Cargo.lock locally.");
}

const packageBlocks = lockfile.split(/\r?\n(?=\[\[package\]\]\r?$)/m).filter((block) =>
  block.startsWith("[[package]]"),
);

if (packageBlocks.length === 0) {
  throw new Error("Cargo.lock did not contain any package records.");
}

const deniedPackages = new Map([
  ["arrayref", new Set(["0.3.10"])],
  ["append-only-vec", new Set(["0.1.9"])],
  // These lookalike package names are not dependencies of JABS. Reject every version.
  ["proc-macro1", null],
  ["proc-macro-en", null],
]);

const allowedRegistrySource = "registry+https://github.com/rust-lang/crates.io-index";

for (const block of packageBlocks) {
  const name = block.match(/^name = "([^"]+)"$/m)?.[1];
  const version = block.match(/^version = "([^"]+)"$/m)?.[1];
  const source = block.match(/^source = "([^"]+)"$/m)?.[1];

  if (!name || !version) {
    throw new Error("Cargo.lock contains a package record without a name or version.");
  }

  const deniedVersions = deniedPackages.get(name);
  if (deniedVersions === null || deniedVersions?.has(version)) {
    throw new Error(`Cargo.lock contains denied package ${name} ${version}.`);
  }

  if (source && source !== allowedRegistrySource) {
    throw new Error(
      `Cargo.lock contains unreviewed dependency source ${source} for ${name} ${version}.`,
    );
  }

  if (source === allowedRegistrySource && !/^checksum = "[a-f0-9]{64}"$/m.test(block)) {
    throw new Error(`Registry package ${name} ${version} is missing its SHA-256 checksum.`);
  }
}

const glib = packageBlocks.filter((block) => /^name = "glib"$/m.test(block));
if (glib.length !== 1 || !/^version = "0.18.5"$/m.test(glib[0]) || /^source = /m.test(glib[0])) {
  throw new Error("The current GTK3 graph must use the reviewed local GLib security backport.");
}
const manifest = await verifyVendoredGlib(resolve(process.cwd(), "vendor", "glib"));
console.log(`Verified GLib ${manifest.version} backport for ${manifest.advisory}.`);

console.log(`Rust lock policy passed for ${packageBlocks.length} locked packages.`);
