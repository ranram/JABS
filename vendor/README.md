# Vendored GLib

JABS includes GLib 0.18.5 with the upstream fix for
[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).
Tauri's GTK3 dependencies still require GLib 0.18, so this copy provides the fix
without breaking compatibility. It also includes minor compiler-warning fixes.

Patch details and checksums are in [`glib/JABS_PATCH.json`](glib/JABS_PATCH.json).
The original license and copyright files are kept alongside the source.

Run `pnpm run rust-lock:check` to verify the vendored source and dependency rules.
Remove this copy and its Cargo override when JABS can use a compatible upstream
version that includes the security fix.
