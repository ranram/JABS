# Windows installer

`installer.nsi` is adapted from Tauri CLI 2.11.4 under the MIT license included here. It omits the delete-application-data checkbox and AppData deletion code. Uninstall removes installed application files, shortcuts and installer registry entries. The final installation-directory removal is nonrecursive.

Replacement installs pass `/UPDATE /P` to older Tauri NSIS uninstallers to suppress their data-deletion branch. Running an older uninstaller directly retains its original behavior.

## Updating the template

`pnpm version:check` verifies the template path, SHA-256 and CLI version before packaging. When upgrading Tauri, compare its NSIS template, retain the data-preservation changes, and update the reviewed hash in `scripts/check-release-config.mjs`. Keep LF line endings so the hash matches on Windows.

## Windows validation

Use a disposable Windows account or VM with saved settings and media in the Roaming and Local application-data folders. Close JABS and compare file hashes before and after each case:

1. Uninstall through Windows Settings. The confirmation page must have no data-deletion checkbox, and saved files must remain.
2. Replace an older Tauri NSIS build using the new installer’s uninstall-and-reinstall choice. Saved files must remain.
3. Repeat for same-version replacement and a passive updater install. Launch JABS afterward and check that settings, players and media load.
