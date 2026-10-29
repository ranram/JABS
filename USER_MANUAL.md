# JABS User Manual

For downloads and installation, see the [README](README.md). For a guided introduction, choose a tutorial from **Help** in the toolbar.

## Run a match

Load a start.gg tournament link and select an event. Find a match by player, round, station, score, or set ID, then choose **Send to Stream** to show it in your overlays.

With an event loaded, use **Matches → Set Selector** to switch matches on the fly from another tab. In **Bracket Management**, use the selector already shown there.

Use **Edit stream state** to adjust players, scores, and match details. Changes save automatically. Expand **Scoreboard appearance** at the top of the editor to choose the style, font, photo settings, logos, and broadcast rails. Extra match and player details can be expanded when needed. **Game** sets the rules and character choices. **Scoreboard styling** chooses the look. For games outside the built-in lineup, **Game profile for set** lets you change the rules profile if needed.

Opening **Flag & player details** expands both players together.

Choose **Clear player details** in the editor header to prepare a match manually. Both slots return to **Player 1** and **Player 2**, with player details, scores, and game history cleared. Game and broadcast settings stay in place. Clearing pauses the queue and detaches the current start.gg set. Saved player profiles, queued matches, and the previous set's saved progress are preserved.

To report results to start.gg after clearing, load the match through **Matches → Set Selector**. Entering players manually will not link a match to the ongoing tournament.

Tournament seeds appear as read-only values in player details. Use **Scoreboard appearance → Show seeds in scoreboards** to hide or show them without changing the imported values. Exhibitions do not show seeds. Versus Screen keeps its own seed-row selection.

For an exhibition, choose a game and enter the players without loading a tournament. Select saved players from the library to reuse their game preferences. If both have start.gg profiles, the Versus Screen can also show their head-to-head history. First-to formats and Topanga Rules are available for exhibitions.

Set the **Exhibition title** under **Match details** and choose an **Exhibition logo** under **Scoreboard appearance**. These labels appear whenever the stream match has no linked start.gg set, including after clearing player details.

Returning to a previously selected match restores its saved progress. JABS keeps these edits for seven days after the last change, and keeps the match currently on stream until you move on. Player profiles and overlay settings do not expire.

### Connect to start.gg

Public tournaments work without a token. To report results, your start.gg account needs reporting permission for the tournament and a token:

1. Sign in to start.gg and open **Developer Settings**, linked in the official [authentication guide](https://developer.start.gg/docs/authentication/).
2. Choose **Create new token** and give it a description such as `JABS`.
3. Copy the token when it appears; start.gg shows it only once.
4. In JABS, open **API access**, paste the token, and choose **Save token**.

JABS saves tokens in your operating system's secure credential storage. If it is unavailable, **Use for session** keeps the token until JABS closes. Keep your token private and revoke it on start.gg if it is exposed.

### Score and report

Local score changes do not update start.gg. Choose **Report result** and confirm when the set is complete. **Quick Score Update** reports another set without replacing the match on stream.

Before submitting through Live Controls or Quick Score Update, JABS checks the latest start.gg result. If another organizer changed the set's status, entrants, or score, JABS stops the report and keeps your local progress. Reload the set from start.gg, review the latest result, and confirm again. Use **Refresh set selector** to pick up other bracket changes while working with multiple organizers.

To report an exact score, record each game in order as you update the streamed match. If you started with a score imported from start.gg, JABS can report only the winner. To include the exact score, reset the local scores and enter the games in order.

For a result without game scores, choose **W** beside the winner or **DQ** beside the player being disqualified, then report and confirm. DQ awards the win to the opponent. You can switch players or clear your selection before confirming. These options are available in Live Controls and Quick Score Update. Completed matches in the set selector show **W/DQ** or **W/L** beside the players and in the final score.

W and DQ leave your local scores and history intact. They report the outcome without sending game scores or character selections to start.gg. The queue waits for you to confirm or clear the choice, then follows its selected advance mode. These results skip the automatic winner stinger. Use **+** and **−** to record played games and their characters when reporting a normal score.

Under **Bracket**, **Refresh set selector** updates the bracket list and reporting status for the matches it loads, including the match on stream. Opening a set's details also refreshes its reporting status. These checks preserve local scores. **Refresh current set** reloads the on-stream set's status and scores from start.gg, replacing local scores after confirmation.

If you reset a result on start.gg, refresh the Set Selector or open the match's details to update its reporting status in JABS. Your previous local scores remain available. Update or reset them before reporting a new numeric result. A new completed result can play the automatic winner stinger once.

### Queue upcoming matches

For a walkthrough, choose **Help → Use the Match Queue**.

Choose **Add match to queue** in a set's actions to prepare upcoming matches without changing what is on stream. Open **Matches → Queue** from any tab, or choose **Queue** in Live Controls. Each queue belongs to one event. Clear it before adding matches from another event.

You can queue sets with one or both opponents marked **TBD**, as long as the set already exists in the selector. Their names fill in when you refresh the selector or the queue fetches that match. If its turn arrives before both opponents are known, the queue shows **Waiting for opponents** and checks only that set every 15 seconds. The current match stays on stream until the next one is ready. **Pause queue** stops the checks.

To prepare a Top 8, open **Matches → Queue** and choose **Queue Top 8 automatically**. Review the proposed matches and choose **Yes, add matches**. JABS adds the missing, unreported sets in this order: both Winners Semi-Finals, both Losers Round 1 matches, both Losers Quarter-Finals, Winners Finals, Losers Semi-Finals, Losers Finals, Grand Finals, and the reset if start.gg lists it. Existing queue entries keep their positions and the current match stays on stream. This adds matches without starting the queue. If JABS cannot identify the Top 8 path, add the matches manually from the Set Selector. An unused reset can remain at the end. Clear the queue when the tournament is finished.

Use the arrow buttons to reorder, the screen button to send a match to stream, and the trash button to remove it. Hover over a button to see its label. In the Set Selector, the **Queued** filter shows queued matches in queue order and combines with the other filters. Turn it off to return to the usual bracket order.

**Current** marks the queue position, and **Up next** marks the following match. Before starting, a queued match already on stream can be Current. **Completed** means JABS has a local winner awaiting a report. **Reported** means start.gg has confirmed the result. Result labels remain visible before and after starting the queue. After resetting results on start.gg, refresh the Set Selector before reviewing the queue. Clearing and rebuilding the queue also checks each added match against start.gg.

Choose how matches advance:

| Mode | When the match changes |
| --- | --- |
| **Manual** | When you use the navigation controls or send a queued match to stream. |
| **After result is reported** | After start.gg confirms a report submitted through JABS for the current queued match. |
| **Delay after a winner is decided** | After the current match has a winner and the chosen **1–30 minute** delay ends. Playing time does not count toward this delay, and the result is not reported for you. |

Changing the mode starts a populated queue immediately. **Start queue** keeps an unreported queued match already on stream, or loads the first unreported match in queue order. If the queue has finished, Start continues with the matches added after its last position.

Editing the delay keeps a running queue running and a paused queue paused. An existing countdown resets to the newly chosen duration. Changing the winner also restarts the countdown. Clearing the winning result cancels it.

**Previous match**, **Next match**, and sending a queued match to stream pause automatic advancement. Choose **Resume** to continue.

Use **Pause queue** before rearranging Current or earlier matches. While running, only upcoming matches can move. Reordering keeps the same match on stream and moves its Current label with it.

Adding or removing upcoming matches leaves the live match intact. Removing **Current** loads **Up next**, preserving whether the queue was running or paused. With no next match, the queue stops and leaves the live match visible.

The queue saves locally. Restarting JABS or losing the connection stops automation. Switching events pauses it too. A finished queue remembers its position so you can add matches and start it again. Automatic advances wait while you edit, save, report a result, or play a stinger. Queue controls do not change OBS scenes or start.gg stream assignments.

### Shortcuts

Enable shortcuts in Settings. They pause while you type or work in a dialog, and while match changes are being saved.

| Shortcut | Action |
| --- | --- |
| `1` / `2` | Add a point to Player 1 / 2 |
| `Shift+1` / `Shift+2` | Subtract a point from Player 1 / 2 |
| `Ctrl+Shift+R` | Reset scores |
| `Ctrl+Shift+S` | Swap players |
| `Ctrl+Shift+C` | Swap commentators |

## OBS

Choose a source from **Copy overlay URL** in the toolbar, then paste its URL into an OBS Browser Source. Set its size to `1920×1080`, clear any custom CSS, and keep JABS running while broadcasting.

The Scoreboard follows the current match. Winner & Champion stays blank until there is a winner, then chooses the winner or champion presentation automatically. Set up the other sources under **Overlays**. For Bracket View, choose a phase and pool; for Top 8 Matchups, load the opening matchups from your event.

In **Edit stream state**, **Scoreboard font** changes the scoreboard and its information rails; **[DEFAULT]** restores the selected style's fonts. Custom scoreboards keep their own font choice. Use **Settings** for colors and broadcast language.

In **Settings**, choose a saved appearance preset to apply it. To create one, choose **New preset**, adjust the default settings, enter a name, and choose **Save preset**. This creates a separate preset and keeps your other saved presets.

Settings identifies the active preset and remembers it after restarting. A **modified** label means your current settings differ from that preset. Choose **Update preset** to save the changes to it. Clearing the selection or deleting the preset leaves your current appearance in place as custom settings.

To use your own OBS background, enable **Transparent background** for the overlay. In Versus Screen, turn off **Match information backdrop** to remove the center panel's background while keeping the comparison rows visible.

For animated overlays that should start fresh when you return to their scene, enable **Shutdown source when not visible** and **Refresh browser when scene becomes active** in OBS's Browser Source properties. These settings unload the hidden page and reload it when activated. Leave them off for sources you want to keep running between scenes, including Stingers.

### Stingers

Add your Perfect and Winner videos under **Stingers** in WebM format. Use **Winner framing** to check how the player's photo, character art, and name fit your video. This preview stays inside JABS and does not trigger OBS. Winner playback requires a completed set and can start automatically.

To try it first, use the [sample Winner stinger](examples/stingers/Winner-Placeholder.webm).

Place the Stingers Browser Source above your other OBS sources and reuse it in the scenes where you want playback. Enable **Control audio via OBS** to mix its sound in OBS.

Layer order determines which graphics cover the stinger. It should not change JABS's ready-source count. Hiding the Stingers source or leaving its active scene stops it from playing.

The toolbar's **Stingers** menu lets you play or stop configured clips from any tab. If playback loses its connection, check that the source is in the active OBS scene, then choose **Reconnect OBS source**. This renews registration without restarting JABS. If OBS failed to load the overlay page, use **Refresh cache of current page** in that Browser Source's properties first.

## Player Library

Open **Matches → Players**. Use **+** in the Players header to create a local profile, or enter a player ID or profile link under **start.gg profile** and choose the search button. To import an event’s roster, choose **Import event players** beside the event selector. Save their details and character choices for each game. To use those choices in an exhibition or graphic, select the player from the suggestions as you type their name.

The **On stream** buttons open each player's saved profile. If a player is not in the library yet, JABS prepares a new draft from their current details. Use the X in the player header to close the profile. JABS asks before discarding unsaved edits.

When you select a saved player, changes to their flag, pronouns, social handle, character, or outfit in **Edit stream state** also update their library profile. Name, sponsor, and score changes apply to the current match.

In **Players**, choose **Use imported value** to show the imported start.gg value again. Clearing a field hides its value.

Use **Export library** to back up player records, and back up your image folders separately. Versus placements stay in JABS's local database and are not included in the library export. **Import library** adds new players and keeps existing local records.

### Scoreboard photos and logos

Enable **Player photos in scoreboards** in **Edit stream state**. Open **Players** to adjust each photo for the selected game and side. Both built-in and custom scoreboards place photos in fixed areas for that game. Player photos are unavailable for Smash Ultimate.

To show a logo behind the photos, choose one option in **Edit stream state**:

- **Tournament logo behind players** (or **Exhibition logo behind players**): choose a logo under **Scoreboard appearance**.
- **Sponsor logos behind players:** add logos to `sponsors/`, with filenames matching each player's sponsor or prefix.

Selecting one option turns the other off. After adding logo files, choose **Reload assets**.

## Add artwork and photos

Open **Media → Open assets folder**, or choose a specific folder from **Media**. Add or edit your files, then return to JABS to pick up the changes. The current preview stays visible while replacements load. Use **Media → Reload assets** to force a refresh.

| Media | Folder | Filename |
| --- | --- | --- |
| Character art | `game-assets/<game>/characters/` | Character name |
| Square character portrait | `game-assets/<game>/portraits/` | Character name |
| Player photo | `players/` | Player tag |
| Player headshot | `player_headshots/` | Player tag |
| Sponsor logo | `sponsors/` | Sponsor or prefix |
| Tournament logo | `tourney-logos/` | Choose it in JABS |

Use PNG, JPEG, or WebP. For player photos, a transparent `1024×1536` cutout works well; for scoreboard headshots, use `512×512`. Headshots take priority over regular photos on scoreboards.

Selecting a game may create empty character files. Replace these with your artwork. Numbered filenames such as `Mario-1.png` and `Mario-2.png` add outfits. See [Game artwork](game-assets/README.md) for naming details.

In Versus Screen, Top 8 Generator, and YouTube Thumbnail Generator, drag either the photo or character art to move it. Click a visible part of the image to select it, or use `Alt+click` when images overlap. **Reset position** restores the selected image's position and size.

With an image selected, arrow keys move it, `Shift` + arrows moves it farther, `+` / `-` resizes it, and `F` flips it.

Versus Screen saves position, size, and flips for each set. When you adjust saved players, JABS also remembers those placements for future matches and exhibitions using the same game, artwork, side, and photo/character layout. Returning to a set uses its own saved placements first.

## Custom scoreboards

Import a transparent PNG at `1920×1080`, up to 20 MiB. Position the player names, scores, and other fields over your frame, choose a font under **Appearance**, then choose **Use in OBS**. Your layout appears through the regular Scoreboard source URL.

Layout changes save automatically. Drag a field to move it or use arrow keys for 1 px adjustments and `Shift` + arrows for 10 px. `Alt+click` reaches overlapping fields. **Mirror to Player 1/2** copies a field's size and placement to the opposite side; you can still edit each side separately.

At the bottom of **Appearance**, use **Broadcast extras** to enter left and right rail text and choose which rails appear. The center rail uses match details.

## Top 8 graphics and thumbnails

Top 8 Generator can import completed event standings or use players you enter yourself. YouTube Thumbnail Generator can use the match on stream or a manually entered matchup. Choose the game, fill in the players, and adjust the appearance and artwork in the preview.

Download the finished PNG from the toolbar: Top 8 graphics export at `1920×1080`, and thumbnails at `1280×720`.

You can switch tabs and return to your unfinished graphic. Download it before closing or updating JABS, since generator drafts are not restored after a restart.

## Troubleshooting and support

- **Blank overlay:** check the Browser Source URL and active match, then use OBS's **Refresh cache of current page**. Winner & Champion needs a completed result.
- **Missing image:** check its folder and filename, then reload assets. Keep only one image matching each player or sponsor name.
- **Wrong fonts or blank sources after switching builds:** update each affected Browser Source with its overlay URL from the running JABS app, then choose **Refresh cache of current page**. If an older source stays blank, temporarily add `?reload=1` to its URL and apply it to force a new navigation. Remove it once the overlay reconnects.
- **Rejected report:** refresh the set and check your reporting permissions before retrying. Another organizer may have changed the result.

For other problems, open **Help → Diagnostics & support** and export a report. Email **akatsatech@gmail.com** with what happened and roughly when, and attach the report after reviewing it. JABS does not send it automatically. Reports leave out tokens, player text, saved settings, and personal file paths.

If JABS cannot open, its logs are in the application-data folder:

| System | Logs folder |
| --- | --- |
| Windows | `%APPDATA%\gg.jabs.desktop\logs` |
| macOS | `~/Library/Application Support/gg.jabs.desktop/logs` |
| Linux | `$XDG_DATA_HOME/gg.jabs.desktop/logs`, usually `~/.local/share/gg.jabs.desktop/logs` |
