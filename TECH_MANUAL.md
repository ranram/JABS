# JABS Technical Manual

Development setup is in the [README](README.md). Broadcast operation and media setup are in the [User Manual](USER_MANUAL.md).

## Development tools

CI uses Node.js `24.22.1`, pnpm `11.18.0`, and Rust `1.97.1`. The [README](README.md#develop) lists supported versions and platform dependencies. After switching Node versions, check `node --version` and `pnpm --version` in the terminal you use to build JABS.

Run `pnpm install --frozen-lockfile` from the repository root. This installs the project's Tauri CLI, Vite, TypeScript, and Vitest versions; global copies are unnecessary.

| Command | Use |
| --- | --- |
| `pnpm run dev` | Run the desktop app with the Rust core and Vite development server. |
| `pnpm run dev:web` | Run only the renderer at `http://127.0.0.1:5173`; live data requires the JABS local service. |
| `pnpm run build:web` | Build renderer assets without creating an installer. |

## Architecture

JABS uses Tauri 2 with a Rust core and a React/Vite renderer. Mantine supplies operator controls. OBS pages use separate styling and a fixed `1920×1080` canvas.

| Area | Location |
| --- | --- |
| Native state, SQLite, secrets, local HTTP and WebSockets | `src-tauri/src/` |
| start.gg transport, including anonymous public reads | `crates/jabs-startgg-client/` |
| Operator UI and graphic generators | `src/renderer/src/ui/operator/` |
| OBS components and feature styles | `src/renderer/src/ui/` |
| Shared schemas, game profiles, and rules | `src/shared/` |
| Translations | `src/renderer/src/i18n/catalogs/` |
| Reviewed character rosters and aliases | `character-lists/` |

Feature folders group components, CSS, and unit tests. Shared request and response types live in `src/shared/`; changes to these types need corresponding Rust and TypeScript updates, including support for existing saved data.

## Local OBS service

OBS connects to a local service at `http://127.0.0.1:4279` by default. The service listens only on the local computer. Requests that change app state require `X-JABS-Action: renderer-v1`. Tokens stay in the native core and are never included in URLs or API responses.

| Source | Route |
| --- | --- |
| Scoreboard | `/overlay/active/main` |
| Versus Screen | `/overlay/active/versus` |
| Winner & Champion | `/overlay/active/winner` |
| Stats: Player 1 | `/overlay/active/stats?player=1` |
| Stats: Player 2 | `/overlay/active/stats?player=2` |
| Top 8 Matchups | `/overlay/active/top-eight-matchups` |
| Commentators | `/overlay/commentators` |
| Bracket | `/overlay/active/bracket` |
| Stingers | `/overlay/stingers` |

The scoreboard route shows the selected built-in or custom layout. The result route chooses Winner or Champion from the match result; `/overlay/active/champion` remains a supported alias.

## Catalogs and translations

Built-in rosters are maintained in `character-lists/<game-id>.json`. Saved selections refer to canonical character names, so renaming one affects existing saves. Aliases apply within a single game and must remain unique after normalization.

After editing a roster, regenerate and check the catalogs:

```sh
pnpm run rosters:sync
pnpm run rosters:check
```

Game profiles are defined in `src/shared/gameProfiles.ts`. Team sizes and match formats are defined in `characterTeamPolicies.json` and `matchFormatPolicies.json`. Artwork filenames are parsed in `src-tauri/src/catalogs/character_assets.rs`; the naming rules are described in [Game artwork](game-assets/README.md).

For other games, JABS caches character names from start.gg in `.jabs-roster.json`. This file helps distinguish punctuation and numbers in character names from outfit suffixes. To fetch updated names, choose **Clear bracket history** and reselect the game. If no roster is available, JABS derives names from filenames.

Moderation runs in Rust. `moderation.rs` handles matching, while `state/text_moderation.rs` checks stream fields during edits, imports, and restoration. Source lists are in `bad-word-list/`; matching rules and reviewed exceptions are maintained under `scripts/`.

After changing a source list, run `pnpm run moderation:sync` and `pnpm run moderation:check`. A leading `!` protects a term from local allowlist exceptions. This annotation belongs in the source file and must be retained when updating upstream lists. The generator checks for conflicts with reviewed exclusions.

The local `moderation-allowlist.txt` allows exceptions for complete field values. Protected whole terms and disguised spellings cannot be added. A protected fragment inside a longer word can still receive an exception for that full word. If an edited allowlist is rejected, the previous rules remain active.

Catalog entries normally match whole words or phrases. A leading `~` also matches a term inside longer words or across separators; use `!~` when the term is protected as well. A leading `=` allows an exact field value, subject to the protected-term checks. Keep these markers when updating source lists. Exact matching ignores case and surrounding whitespace after Unicode normalization. Rejected input is excluded from errors and logs.

Interface text is maintained in `en.ts` and `es-419.ts` under `src/renderer/src/i18n/catalogs/`. New or changed text needs an entry in both languages. Imported names and event labels retain their original language.

## Persistence and exports

The database, imported custom scoreboards, and stinger videos are stored in Tauri's application-data directory. During development, media catalogs use repository folders. Installed copies use matching folders in the application-data directory; JABS displays their paths in the interface.

Stinger settings are saved in SQLite. Playback requests stay in memory, and each request is assigned to one active OBS source to prevent duplicate playback. The source at `/overlay/stingers` plays WebM videos, with support for loading portions of a file. Users convert videos before importing them and control audio levels in OBS. Shared framing settings are defined in `src/shared/stingers.ts`.

The Player Library stores profiles and local overrides in `players`, searchable tags in `player_aliases`, and game preferences in `player_games`. Related records use `players.local_id`; start.gg IDs distinguish players who share a tag. An absent override uses the imported value, while an empty string deliberately hides it. Use SQLite's `.backup` command when backing up a running app so recent database writes are included.

`set_overrides` stores each match's progress as JSON, keyed by its start.gg set ID. Returning to a match restores that progress and applies current Player Library defaults. Images remain in the media folders; the saved match contains their filenames.

Versus placements are handled in `versus_screen.rs` and `versus_screen/media.rs`. Set adjustments are stored in `set_overrides.versus_media`, with separate layouts for character art, player photos, and their combined composition. Player defaults are stored in `player_versus_media` for each game, artwork, side, and composition. Saved set adjustments take priority over player defaults, followed by automatic positioning. Player defaults survive restarts and are not included in Player Library JSON exports.

Saved matches expire seven days after their last edit. JABS removes expired records at startup and when selecting a match, while retaining the match currently on stream. Player profiles and overlay settings do not expire.

Top 8 and thumbnail PNG exports are handled by `ui/operator/exportGraphic.ts`. The exporter identifies image layers through `data-export-image-layer`, clipping regions through `data-export-clip`, and permitted labels through `trustedText`.

Both generators share image controls in `GeneratorMediaControls.tsx`, editor layout styles in `generatorLayout.css`, and fonts in `generatorFonts.css`. The exported designs use `topEight.css` and `thumbnail.css`, keeping editor spacing separate from the finished image.

Font IDs are defined in `src/shared/fonts.ts`; font declarations and selectors are in `ui/fonts/`. The `scoreboardFont` preference controls built-in scoreboards and their rails. It is stored separately from the `appearance` object used by presets and exports. Custom scoreboards save their own choice in `typography.font`.

Help tutorials are implemented in `ui/tutorials/`. Starting a guide loads Driver.js; `tutorials.ts` defines the highlighted controls and navigation, and the translation catalogs provide the text. Popovers use JABS styles and Mantine controls. Score shortcuts pause during a tour, and closing it cancels any observers waiting for the next highlighted control.

## Scoreboard photos

The `scoreboard-photos` setting enables player photos. Each player's position, scale, and flip settings are saved in `player_scoreboard_photos` for each game and side. JABS looks for a matching headshot in `player_headshots/` first, then a photo in `players/`. Older crop settings still work; replacing an image resets its framing until the user adjusts it.

Built-in and custom scoreboards use the same photo shapes from `src/shared/scoreboardPhotoLayouts.json`. Changing the scoreboard style does not move the photo panels. Games without a photo layout, including Smash Ultimate, display no photo layer and do not load photo media.

Photo panels can show either a tournament logo (`logoBackdrop`) or each player's sponsor logo (`sponsorBackdrop`) behind the photo. Both options are off by default. Logos appear at 14% opacity: expanded logos stay upright, while wide logos follow opposite diagonals on the two sides. Their proportions are preserved, and the panel mask prevents them from covering protected parts of the game HUD. This feature uses the shared image cache and works independently of the main broadcast logo's visibility setting.

## Verification

Contributor checks:

```sh
pnpm check
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

While developing, use `pnpm test` or focused native tests. `pnpm run typecheck` also checks generated catalogs and source-size limits.

Release CI also checks both dependency lockfiles for security advisories. To run the same audits locally:

```sh
pnpm audit
cargo install cargo-audit --version 0.22.2 --locked
cargo audit --file src-tauri/Cargo.lock
```

Unit tests sit beside the feature they cover; workflow tests live in `src/integration/`. Useful regressions check saved data, validation, responses arriving out of order, and user actions. Shared controls need thorough coverage once, followed by short integration checks in the screens that use them. `createTestCustomScoreboard` provides a standard layout fixture; migration tests use explicit older inputs. Database paging tests need only enough records to cross a page boundary.

## Diagnostics and native error text

`diagnostics.rs` writes logs in the background under `app_data_dir/logs`, keeping up to three files of 2 MB each. Entries identify the event, affected feature, app version, and session. Where relevant, they also include HTTP status and the location in the source code. Repeated entries are counted together, and a session marker helps identify unexpected shutdowns. Tokens, player text, saved settings, URLs, and raw error contents are excluded.

`diagnostics.ts` reports failures from the interface and desktop commands. OBS pages send diagnostic details to `/api/diagnostics/renderer`; these requests require the action header, pass origin checks, and are limited to 1 KB.

Users can export a diagnostic report, open the logs folder, or start a support email from **Help → Diagnostics & support**. They review and attach the report before sending it.

`i18n/nativeErrors.ts` translates native errors before the interface displays them. Known error codes use the regular translation catalogs; older English messages use `nativeErrors.es-419.json`. New native messages need Spanish translations so users receive the same recovery advice in either language. Unrecognized errors show a translated fallback message. The original diagnostic records and API responses remain unchanged.

## Build an installer

```sh
pnpm run build
```

Build in a supported environment for the target OS. Packages go to `src-tauri/target/release/bundle/`. Keep local tokens, databases, and unlicensed media out of distributions; see [asset licensing](ASSET_LICENSES.md).

`pnpm run clean:native` removes Rust build artifacts.
