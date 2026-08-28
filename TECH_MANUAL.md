# JABS Technical Manual

This manual is for developers and designers who want to change JABS. For tournament operation, see the [User Manual](USER_MANUAL.md).

The paths and commands below describe the current project. You can adapt a fork to your needs. Changes submitted to the main project are reviewed through the usual pull request process.

## Get started

JABS uses Tauri 2, Rust, React, Vite, and Mantine. Install the platform requirements listed in the main [README](README.md), then install the locked dependencies:

```sh
pnpm install --frozen-lockfile
```

Start the desktop app:

```sh
pnpm run dev
```

Useful checks:

| Command | Purpose |
| --- | --- |
| `pnpm run typecheck` | Check TypeScript and generated catalogs |
| `pnpm test` | Run frontend tests |
| `pnpm run check:rust` | Check the Rust application |
| `pnpm check` | Run all project checks |
| `pnpm run build:web` | Build the renderer only |
| `pnpm run build` | Build the packaged desktop app |

## Project map

| Area | Location |
| --- | --- |
| Desktop and native application | `src-tauri/` |
| Rust source | `src-tauri/src/` |
| React renderer | `src/renderer/src/` |
| Main operator interface | `src/renderer/src/ui/OperatorDashboard.tsx` |
| Operator controls and generators | `src/renderer/src/ui/operator/` |
| Shared models and game settings | `src/shared/` |
| Main application styles | `src/renderer/src/controlDeck.*.css` |
| OBS overlay styles | `src/renderer/src/styles.css` |
| Character source lists | `character-lists/` |
| Game artwork | `game-assets/` |
| Player photos | `players/` |
| Sponsor logos | `sponsors/` |
| Tournament logos | `tourney-logos/` |
| Interface translations | `src/renderer/src/i18n/catalogs/` |

Frontend components, their CSS, and focused unit tests are kept near the feature they cover. Shared code lives in `src/shared/`, while Rust tests stay with their Rust modules.

## Change the operator interface

The operator interface starts in these files:

- `src/renderer/src/ui/OperatorDashboard.tsx` assembles the dashboard.
- `src/renderer/src/ui/operator/WorkspacePanels.tsx` contains the main workspaces.
- `src/renderer/src/ui/operator/StartggPanel.tsx` handles tournament and set selection.
- `src/renderer/src/ui/operator/StreamEditorPanel.tsx` contains stream-state editing.
- `src/renderer/src/controlDeck.*.css` contains the application layout and styling.
- `src/renderer/src/ui/theme.ts` contains the Mantine theme.

Controls for a specific feature normally have a matching component under `src/renderer/src/ui/operator/`. For example, player fields are in `PlayerEditor.tsx`, commentator fields are in `CommentatorControls.tsx`, and score controls are in `ScoreControls.tsx`.

Run `pnpm run dev` to review interface changes in the desktop window.

## Change score overlays

Score overlays are rendered by `src/renderer/src/ui/OverlayView.tsx`. Their shared presentation helpers are in:

- `src/renderer/src/ui/ScoreOverlayContext.tsx`
- `src/renderer/src/ui/overlayPresentation.ts`
- `src/renderer/src/ui/overlayPlayerPresentation.ts`
- `src/renderer/src/styles.css`

Game names, aliases, themes, and overlay templates are defined in `src/shared/gameProfiles.ts`.

OBS uses a transparent 1920×1080 browser source. The active score overlay is available at:

```text
http://127.0.0.1:4279/overlay/active/main
```

When adjusting an overlay, open the matching game and check that names, scores, flags, pronouns, characters, round information, and station information fit at both short and long lengths.

## Change Winner and Champion screens

The main files are:

- `src/renderer/src/ui/OverlayView.tsx`
- `src/renderer/src/ui/announcementPresentation.ts`
- `src/renderer/src/styles.css`
- `src/shared/resultScreen.ts`
- `src-tauri/src/result_screen.rs`
- `src/renderer/src/ui/operator/ResultScreenControls.tsx`

Use these routes in OBS:

```text
http://127.0.0.1:4279/overlay/active/winner
http://127.0.0.1:4279/overlay/active/champion
```

The controls allow tournament logos, player photos, sponsor logos, character artwork, and team portraits to be shown when matching media is available.

## Change the Versus Screen

The main files are:

- `src/renderer/src/ui/VersusOverlay.tsx`
- `src/renderer/src/ui/versusOverlay.css`
- `src/renderer/src/ui/operator/VersusPreview.tsx`
- `src/renderer/src/ui/operator/VersusScreenControls.tsx`
- `src/shared/versusScreen.ts`
- `src-tauri/src/versus_screen.rs`

The OBS route is:

```text
http://127.0.0.1:4279/overlay/active/versus
```

Media placement is handled by `AdjustableMediaImage.tsx` and `adjustableMedia.css`. The preview supports dragging, arrow-key movement, scaling, and resetting a layer.

## Change the Commentator overlay

The main files are:

- `src/renderer/src/ui/operator/CommentatorControls.tsx`
- `src/renderer/src/ui/OverlayView.tsx`
- `src/renderer/src/ui/commentatorOverlay.css`
- `src/shared/commentators.ts`
- `src-tauri/src/commentators.rs`

The OBS route is:

```text
http://127.0.0.1:4279/overlay/commentators
```

The easiest visual adjustments are the custom properties near the top of `.commentator-lower-third` in `commentatorOverlay.css`:

```css
--commentator-rail-height: 90px;
--commentator-edge-cut: 34px;
--commentator-border-size: 4px;
--commentator-logo-width: 340px;
--commentator-logo-height: 180px;
```

These values control the rail height, angled ends, border thickness, and logo area.

## Change Top 8 graphics

Top 8 exports are 1920×1080 PNG files. The available layouts are Editorial, Mosaic, and Neon.

| Part | File |
| --- | --- |
| Fields and validation | `src/shared/topEight.ts` |
| Editor state | `src/renderer/src/ui/operator/useTopEightDraft.ts` |
| Controls | `src/renderer/src/ui/operator/TopEightGenerator.tsx` |
| Preview canvas | `src/renderer/src/ui/operator/TopEightCanvas.tsx` |
| Layout and styling | `src/renderer/src/ui/operator/topEight.css` |
| Background handling | `src/renderer/src/ui/operator/topEightBackground.ts` |
| Media loading | `src/renderer/src/ui/operator/useTopEightMedia.ts` |

Layout order and placement values are defined in the canvas, shared model, and stylesheet. Event import is handled by the generator controls and draft hook. All player fields remain editable after importing standings.

## Change YouTube thumbnails

Thumbnail exports are 1280×720 PNG files. The available layouts are Versus, Spotlight, and Split.

| Part | File |
| --- | --- |
| Fields and validation | `src/shared/thumbnail.ts` |
| Editor state | `src/renderer/src/ui/operator/useThumbnailDraft.ts` |
| Controls | `src/renderer/src/ui/operator/ThumbnailGenerator.tsx` |
| Preview canvas | `src/renderer/src/ui/operator/ThumbnailCanvas.tsx` |
| Layout and styling | `src/renderer/src/ui/operator/thumbnail.css` |

The generator can start from the active stream match or be filled manually. Player details, media, labels, and layout choices are controlled by the editor and canvas files above.

## Graphic export

Top 8 and thumbnail downloads use `src/renderer/src/ui/operator/exportGraphic.ts`. The exporter turns the preview into a PNG and adds the selected local images in their visual order.

If a new image does not appear in the downloaded file, compare it with the existing image layers in the canvas component. Exported layers use `data-export-image-layer`, and clipped areas use `data-export-clip`.

If new text appears in the preview but export is rejected, add that text to the trusted-text list passed to the exporter by the canvas.

## Add local media

During development, JABS reads media from the repository folders. Packaged builds use matching folders in the application-data location shown by JABS under **Media folders**.

Supported formats are PNG, JPEG, and WebP.

```text
tourney-logos/<Logo>.png
sponsors/<Sponsor or Prefix>.webp
players/<Player Tag>.webp
game-assets/<game-slug>/characters/<Character>.png
game-assets/<game-slug>/portraits/<Character>.webp
```

The filename is the name JABS uses for matching. Player photos should match the player tag. Sponsor logos can match the sponsor or prefix. Character artwork and portraits should use the same filename stem, such as:

```text
game-assets/ultimate-marvel-vs-capcom-3/characters/Doctor Doom.png
game-assets/ultimate-marvel-vs-capcom-3/portraits/Doctor Doom.webp
```

Square portraits work best in the small team slots. After adding files while JABS is open, use **Reload assets** in the relevant workspace.

## Update a character roster

Editable character lists are stored in `character-lists/`. After changing a list, regenerate the application catalogs:

```sh
pnpm run rosters:sync
pnpm run rosters:check
```

Review and commit the source list together with the generated changes.

Team-size settings are stored in `src/shared/characterTeamPolicies.json`. Character helpers are in `src/shared/characterTeams.ts`.

## Add or change a supported game

Start with `src/shared/gameProfiles.ts`. Each supported game has its display name, recognized aliases, theme values, rules, and overlay template there.

A full game addition normally touches:

1. `src/shared/gameProfiles.ts` for the game profile and start.gg name aliases.
2. `src/renderer/src/ui/OverlayView.tsx` for a new score-overlay template, if needed.
3. `src/renderer/src/styles.css` for its overlay styling.
4. `character-lists/` for its roster.
5. `src/shared/matchFormatPolicies.json` for a game-specific match format, if needed.
6. `src/shared/characterTeamPolicies.json` for games that use teams.
7. Focused tests beside the changed shared or renderer file.

Run the roster sync after adding the character list, then open an event for that game and review its operator controls and OBS overlay.

Games without a built-in profile can still use media under a folder derived from their start.gg game name.

## Change moderation data

Moderation source files are stored in `bad-word-list/` and the reviewed allowlists under `scripts/`. The generated Rust catalog is `src-tauri/src/generated_moderation_terms.rs`.

After changing a source or allowlist, run:

```sh
pnpm run moderation:sync
pnpm run moderation:check
```

Review both the source change and generated Rust change before committing them. Test ordinary player names and tournament names as well as terms that should be rejected.

Packaged installations also create `moderation-allowlist.txt` in the application-data directory. This file is for local tournament decisions and is not compiled into JABS. Each non-comment line permits one exact complete field value after capitalization and whitespace normalization. The app loads it at startup and when the user chooses **Reload allowlist**.

## Add or change a translation

The bundled catalogs are:

```text
src/renderer/src/i18n/catalogs/en.ts
src/renderer/src/i18n/catalogs/es-419.ts
```

User-facing interface text should use a translation key from these catalogs. When adding a language, also update the language selector and locale list under `src/renderer/src/i18n/`.

Player names, tournament names, sponsor names, phases, rounds, and other imported event data are displayed as provided and are not translated.

## Native application and start.gg

The Rust application lives in `src-tauri/src/`:

| Area | File |
| --- | --- |
| Tauri setup and commands | `lib.rs` |
| Local HTTP service and WebSockets | `local_server.rs` |
| start.gg client | `startgg.rs` |
| GraphQL queries | `startgg_queries.rs` |
| Result reporting routes | `reporting_routes.rs` |
| Saved stream state | `state.rs` |
| SQLite storage | `database.rs` |
| Media catalogs | `catalogs.rs` |
| Token storage | `secrets.rs` |
| Moderation | `moderation.rs` |

Shared request and response shapes live in `src/shared/`. When a field crosses between Rust and TypeScript, update both sides and check saved-state compatibility.

## Build an installer

Build the package for the current operating system with:

```sh
pnpm run build
```

Tauri places release packages under `src-tauri/target/release/bundle/`. Windows, macOS, and Linux packages must be built on their respective supported build environments.

Before distributing a build, check that it does not contain local tokens, databases, downloaded media, screenshots, or build-only test material. Release checksums should match the exact files being distributed.
