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

The service checks the exact loopback Host and allowed Origin headers. The action header prevents cross-origin browser writes. It is a public marker, not a secret or proof of the caller's identity. Another local program can construct these requests. This boundary protects against remote web pages and network clients, not malicious software running under the user's OS account. The WebSocket sends updates and does not accept state-changing commands.

OBS keeps the JABS service address when loading an overlay in either dev or an installed app. In dev, `local_server/dev_web.rs` fetches pages and modules from Vite and returns them through that address. It does not redirect OBS to Vite. This lets OBS refresh the source after switching builds, even after the dev server has stopped. Hot updates still connect directly to Vite on port 5173.

`local_server/web.rs` serves packaged pages and assets with their content types and security headers. The dev forwarding client connects only to its fixed local Vite address, times out after five seconds, ignores system proxies, and refuses redirects. A failed fetch returns HTTP 502.

`/assets/` requests use the embedded bundle so cached OBS pages can still load packaged scripts, styles, and fonts. Missing assets return 404 rather than Vite's HTML page. Font responses use `font/ttf`, `font/woff`, or `font/woff2`. Rejected local requests are recorded before the origin guard returns, without retaining request URLs or headers.

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

## start.gg requests

JABS uses compiled GraphQL operations with separate variables, rather than accepting arbitrary queries from the renderer. Its only upstream writes report set results, optionally including game and character selections. Winner-only reports send `winnerId`. DQ reports also set `isDQ: true`. Both omit game data. start.gg enforces the token/account's permissions. Authenticated requests go to `https://api.start.gg/gql/alpha`, with redirects and system proxies disabled. Public browsing uses a separate start.gg website endpoint without sending a token. The shared process-wide request budget permits a burst of four requests and replenishes one request every 800 ms. Separate JABS processes do not share that budget.

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

### Stinger playback

Stinger settings are saved in SQLite. Playback requests stay in memory, and each request is assigned to one active OBS source to prevent duplicate playback. The source at `/overlay/stingers` plays WebM videos, with support for loading portions of a file. Users convert videos before importing them and control audio levels in OBS. Shared framing settings are defined in `src/shared/stingers.ts`.

A source covering the Stingers browser must not make it appear disconnected. JABS uses OBS activity signals to decide whether it can play, because browser visibility can change when sources overlap. A loaded source remains eligible until OBS first reports its activity. An explicit inactive signal disables it, and confirmed activity in Program takes priority over visibility.

`obsSourceActivity` handles OBS events and direct callbacks, ignores duplicate signals, and restores earlier callbacks when the component closes. Heartbeats and native timeouts remove sources that stop responding.

Reconnect OBS source changes the Stingers connection ID. Each loaded overlay stops its local playback and registers with a new client ID without reloading the page. It keeps its OBS activity state, so an inactive source stays inactive. A cue already assigned to a source does not replay.

### Player profiles and saved matches

The Player Library stores profiles and local overrides in `players`, searchable tags in `player_aliases`, and game preferences in `player_games`. Related records use `players.local_id`; start.gg IDs distinguish players who share a tag. An absent override uses the imported value, while an empty string deliberately hides it. Use SQLite's `.backup` command when backing up a running app so recent database writes are included.

`set_overrides` stores each match's progress as JSON, keyed by its start.gg set ID. Returning to a match restores that progress and applies current Player Library defaults. Tournament seeds are refreshed from the imported entrants. `broadcast.seedsEnabled` controls their scoreboard visibility without deleting seed data. Exhibitions omit seed fields and seed text. Images remain in the media folders. The saved match contains their filenames.

Versus placements are handled in `versus_screen.rs` and `versus_screen/media.rs`. Set adjustments are stored in `set_overrides.versus_media`, with separate layouts for character art, player photos, and their combined composition. Player defaults are stored in `player_versus_media` for each game, artwork, side, and composition. Saved set adjustments take priority over player defaults, followed by automatic positioning. Player defaults survive restarts and are not included in Player Library JSON exports.

## Match queue

The native match queue stores its event context, entries, cursor, and settings in `broadcast_surfaces` under `match-queue`. Restoring disables automation and drops old timers and report acknowledgments. A finished queue retains its position so Start can continue with appended entries. `/api/match-queue` provides the snapshot. Guarded action, add, and operator-heartbeat routes update it. Realtime messages use the `match-queue` event.

Rust runs the countdowns and loads matches. `prepare_navigation` chooses the next entry, `load_queued_match` fetches it, and `commit_transition` checks that the queue, connection, and live match still match the request. Automatic changes also wait for editing and playback to finish. Removing Current loads the next match and removes the old entry as one operation. If loading fails, the original entry stays.

Each visit to a queued match has a separate report token. A delayed response from an earlier visit cannot advance the queue after the operator returns to that match.

While paused, every entry can move. The queue finds Current by set ID after reordering, so the live match and remaining delay stay the same. While running, only entries after Current can move. The UI disables the arrows for entries that cannot move.

A queued set can have TBD opponents. Refreshing the selector fills in names as start.gg resolves them. The queue also fetches each set before putting it on stream, so unresolved opponents never replace the live match.

If the next set is still TBD, `match_queue/engine/waiting.rs` keeps the current match on screen and checks only the waiting set every 15 seconds. It uses the existing queue timer and request limit, and waits for editing, reporting, or stinger playback to finish. Pausing, restarting, disconnecting, inactivity, or changing the live match cancels the wait. Each request records the queue revision it started with, so an old failure cannot pause a newer queue action.

### Reports and bracket resets

Live Controls and Quick Score fetch the set from start.gg immediately before reporting. They compare its status, entrants, and scores with `ReportBaseline`, the upstream result the operator last loaded. Local score edits are stored separately. Loading the set refreshes the baseline, and saving a form cannot overwrite it. A missing baseline requires reloading the set.

If another organizer changed the result, or the check fails, JABS stops the report and asks the operator to review the match. It does not mark the queue entry Reported or advance it. Live Controls also checks that the local match has not changed while the request was running. These checks happen only when submitting a report. Another organizer can still change the set between the check and submission.

Saves in progress and unconfirmed W/DQ choices both block navigation, automatic queue advancement, and update installation. Only an active request animates the selector spinner. After a rejected W/DQ report, the choice stays available to confirm or clear, with a static information icon instead of a spinner.

`match_queue/results.rs` manages each entry's `resultStatus`: Completed for a local winner awaiting a report, or Reported for a result confirmed by start.gg. Saved results apply only when the entrant IDs still match.

Local score changes cannot remove a confirmed Reported label. A reset detected on start.gg clears the old result and records `upstreamReset` so saved scores cannot restore the old label. If the reset affects Current, the queue pauses and discards its countdown and report token. The same check clears older Completed labels that lack result-validity data.

At startup, the queue shows saved statuses until a matching start.gg response arrives. Adding a set fetches its current status first. If start.gg says it is unreported but the saved match says it was reported, the queue treats that saved result as reset.

W/L and DQ choices stay in their reporting form until confirmed. A pending-edit hold prevents queue advancement during review. Both reporting routes require confirmation and a winner who belongs to the set. Quick Score saves the report acknowledgement to the matching active set for numeric results as well as W/L and DQ. The active-set route checks the reviewed local version. Quick Score checks a freshly fetched upstream snapshot.

Confirmed results store `reportedOutcome` separately from numeric scores and game history, so queue logic uses the reported winner. Resets and subsequent scoring clear this metadata. Unrelated draft edits preserve it. Both automatic queue modes accept these results, and automatic winner stingers skip them. Overlay scores stay numeric. Selector cards use the completed upstream set's `winnerId` and raw scores to show W/DQ or W/L beside the players and in the final score. A disqualified opponent has a raw score of −1. These display labels do not change numeric scores.

`RuntimeState::observe_startgg_sets` passes results from selector refreshes and match-detail requests to the queue and live match. `state/bracket_status.rs` saves and publishes changes to the matching live set's upstream status and result validity. It preserves local scores, history, player settings, and appearance. Unrelated sets are ignored, and unchanged results send no update. Saved progress and older forms cannot overwrite the fresh upstream status. Only the sets returned by those requests are checked. There is no continuous full-bracket polling.

The live match and queue entry have separate reset flags. The live match's `upstreamReset` controls whether retained scores can count as a result:

| Live-match value | Meaning |
| --- | --- |
| Missing | Imported or older progress without an explicit acknowledgement. |
| `true` | A reset was detected. Retain the scores, but do not treat them as a new win. |
| `false` | The operator has changed or reset scores, or confirmed a report. Local progress can count again. |

Score changes and explicit score resets clear the live match's invalidation. Editing player details or swapping players does not. `state/results.rs` defines these rules for winner detection and saved-match restoration. The queue keeps its own reset flag until a new report is confirmed, allowing it to reject old report events even after scoring resumes.

Refreshing a reset result does not start a countdown or play a stinger. It allows the next newly completed numeric result to play the automatic winner clip once. It does not interrupt current playback.

A restored Reported badge cannot advance the queue. Automatic advancement needs a report confirmed during the current visit to the match. Before the queue starts, navigation can use a queued match already on stream as its position. After starting, it uses the saved queue position. `QueueIconButton` provides labels and tooltips for row actions.

The operator UI sends regular heartbeats with the selected event and whether editing blocks advancement. Replies are applied in order, and closing the workspace cancels outstanding requests. A lost connection or sleep pauses automation. Playing the Winner overlay does not itself advance the queue.

Saved matches expire seven days after their last edit. JABS removes expired records at startup and when selecting a match, while retaining the match currently on stream. Player profiles and overlay settings do not expire.

## Preparing a match manually

`POST /api/state/players/clear` requires the renderer action header and the current `updatedAt`. It rejects stale versions and active reports. The reset replaces both player identities, clears scores and history, and removes the start.gg reporting link while retaining game and broadcast settings. It pauses the queue without removing entries and resets Versus media placements. Persistence updates the stream without writing Player Library records or the previous set's saved progress. `useStreamSetupActions` shares the autosave pause and version-read sequence with exhibition game selection.

## Graphics and media refresh

Top 8 and thumbnail PNG exports are handled by `ui/operator/exportGraphic.ts`. The exporter identifies image layers through `data-export-image-layer`, clipping regions through `data-export-clip`, and permitted labels through `trustedText`.

Both generators share image controls in `GeneratorMediaControls.tsx`, responsive choice controls in `GeneratorChoiceControl.tsx`, editor layout styles in `generatorLayout.css`, and fonts in `generatorFonts.css`. Export readiness labels belong to the shared `generators` translation group. The exported designs use `topEight.css` and `thumbnail.css`, keeping editor spacing separate from the finished image.

When the operator returns to JABS, `useAssetRefreshOnReturn` checks for artwork changes at most once every five seconds. `POST /api/assets/check` uses `catalogs::changes::AssetChangeTracker` to compare file paths, sizes, and modification times. It scans on a worker thread and does not read image contents. Changed files increment the shared asset revision so consumers can reload. Unchanged files leave caches and OBS sources alone. The scan skips directory symlinks to avoid loops, and a failed check leaves the current artwork visible.

`POST /api/assets/reload` forces a revision even when metadata is unchanged. The renderer also requests game-folder preparation for this explicit action. Automatic asset revisions refresh images and catalog choices without repeating folder setup. Character choices remain visible while replacement catalogs load, and logo choices refresh with the shared revision. Generator draft state and framing remain separate from asset refreshes.

Some read operations use POST, including asset checks, player-media lookups, and scoreboard-photo resolution. They still require the action header, but set `RequestOptions.trackPendingWrite` to false because they do not edit the match. This keeps background reads from starting the Set Selector spinner or disabling match cards. Saves and reports keep the default navigation block.

`useGeneratorMedia` keeps the last complete preview visible while refreshing images for the same players and artwork. The operator can keep editing and export what is on screen. Changing the game or player waits for the matching images to finish loading before export is allowed. The hook compares content keys to distinguish a refresh from a different selection.

`ScoreboardPlayerName` defines prefix order for scoreboards and thumbnails. `ThumbnailName` uses `useIdentityTextFit` to measure the full name and prefix inside a fixed-height slot. The same hook fits Versus, custom-scoreboard, and stinger identities. It tracks slot size and font loading, with cleanup on unmount. Wrapped text export captures the fitted text spans and their font metrics.

## Fonts and appearance presets

Font IDs are defined in `src/shared/fonts.ts`; font declarations and selectors are in `ui/fonts/`. The `scoreboardFont` preference controls built-in scoreboards and their rails. It is stored separately from the `appearance` object used by presets and exports. Custom scoreboards save their own choice in `typography.font`.

Appearance preferences store `activePresetId` beside the appearance values. Applying, saving, or importing a preset writes its identity and values together. Edits keep that identity and display a modified label. Clearing the selection or deleting the preset clears its identity without changing the appearance. New preset and Restore defaults clear the identity and restore appearance defaults. Both keep the saved presets and the separate scoreboard font.

For saved data without `activePresetId`, the native store selects a preset only when exactly one matches the appearance values. Explicit null and ambiguous matches remain unselected. Missing preset references clear without discarding appearance values. Portable exports use the version 1 `jabs-appearance` format, which contains the name and appearance values but no local preset identity.

## Help tutorials

Help tutorials are implemented in `ui/tutorials/`. Starting a guide loads Driver.js; `tutorials.ts` defines the highlighted controls and navigation, and the translation catalogs provide the text. Popovers use JABS styles and Mantine controls. Score shortcuts pause during a tour, and closing it cancels any observers waiting for the next highlighted control.

Tutorial descriptions support `**bold text**`. The renderer escapes HTML before converting those markers to `<strong>`. Titles remain plain text. Links use the step's `link` property. Guides close only the menus and queue dialog they opened, leaving previously open controls in place.

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

`diagnostics.rs` writes logs in the background under `app_data_dir/logs`, keeping up to three files of 2 MB each. Entries identify the event, affected feature, app version, and session. Failed requests also identify a fixed operation and HTTP method, with an anonymous request ID, attempt number, elapsed milliseconds, failure reason, and HTTP status when available. Retries and recovery share the request ID. Expected cancellations are informational events. Timeouts, network failures, HTTP errors, and invalid responses remain distinguishable. Ordinary successful requests do not generate entries. Repeated entries are counted together, and a session marker helps identify unexpected shutdowns.

`localApiTransport.ts` owns request handling and pending-write tracking. `requestDiagnostics.ts` measures requests and classifies failures. `diagnosticOperations.ts` maps fixed routes, queue actions, and native commands to reviewed labels. Realtime connection events identify the affected state stream. Native validation and report export use the matching enums in `diagnostics/operations.rs`. Contract tests check that the labels stay compatible and known routes are covered. Older log entries remain readable. Tokens, player text, saved settings, URLs, query values, bodies, headers, and raw error contents are excluded.

`diagnostics.ts` reports failures from the interface and desktop commands. OBS pages send diagnostic details to `/api/diagnostics/renderer`. These requests require the action header, pass origin checks, and are limited to 1 KB. The native boundary validates operation labels, methods, and numeric bounds before writing them. Report exports retain the same reviewed metadata.

Users can export a diagnostic report, open the logs folder, or start a support email from **Help → Diagnostics & support**. They review and attach the report before sending it.

`i18n/nativeErrors.ts` translates native errors before the interface displays them. Known error codes use the regular translation catalogs; older English messages use `nativeErrors.es-419.json`. New native messages need Spanish translations so users receive the same recovery advice in either language. Unrecognized errors show a translated fallback message. The original diagnostic records and API responses remain unchanged.

## Build an installer

```sh
pnpm run build
```

Build in a supported environment for the target OS. Packages go to `src-tauri/target/release/bundle/`. Keep local tokens, databases, and unlicensed media out of distributions; see [asset licensing](ASSET_LICENSES.md).

`pnpm run clean:native` removes Rust build artifacts.
