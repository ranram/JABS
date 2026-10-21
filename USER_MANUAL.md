# JABS User Manual

For downloads and installation, see the [README](README.md). For a guided introduction, choose a tutorial from **Help** in the toolbar.

## Run a match

Load a start.gg tournament link and select an event. Find a match by player, round, station, score, or set ID, then choose **Send to Stream** to show it in your overlays.

Use **Edit stream state** to adjust players, scores, and match details. Changes save automatically. **Game** sets the rules and character choices; **Scoreboard styling** chooses the look. For games outside the built-in lineup, **Game profile for set** lets you change the rules profile if needed.

For an exhibition, choose a game and enter the players without loading a tournament. Select saved players from the library to reuse their game preferences. If both have start.gg profiles, the Versus Screen can also show their head-to-head history. First-to formats and Topanga Rules are available for exhibitions.

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

To report an exact score, record each game in order as you update the streamed match. If you started with a score imported from start.gg, JABS can report only the winner. To include the exact score, reset the local scores and enter the games in order.

Under **Bracket → Options**, **Refresh set selector** updates the bracket list. **Refresh current set** reloads the on-stream set's status and scores from start.gg, replacing local scores after confirmation.

### Shortcuts

Enable shortcuts in the toolbar. They pause while you type or work in a dialog, and while match changes are being saved.

| Shortcut | Action |
| --- | --- |
| `1` / `2` | Add a point to Player 1 / 2 |
| `Shift+1` / `Shift+2` | Subtract a point from Player 1 / 2 |
| `Ctrl+Shift+R` | Reset scores |
| `Ctrl+Shift+S` | Swap players |
| `Ctrl+Shift+C` | Swap commentators |

## OBS

Copy a source URL from **OBS URLs** in the toolbar and paste it into an OBS Browser Source. Set its size to `1920×1080`, clear any custom CSS, and keep JABS running while broadcasting.

The Scoreboard follows the current match. Winner & Champion stays blank until there is a winner, then chooses the winner or champion presentation automatically. Set up the other sources under **Overlays**. For Bracket View, choose a phase and pool; for Top 8 Matchups, load the opening matchups from your event.

In **Edit stream state**, **Scoreboard font** changes the scoreboard and its information rails; **[DEFAULT]** restores the selected style's fonts. Custom scoreboards keep their own font choice. Use **Settings** for colors and broadcast language.

To use your own OBS background, enable **Transparent background** for the overlay. In Versus Screen, turn off **Match information backdrop** to remove the center panel's background while keeping the comparison rows visible.

For entrance animations when changing scenes, leave **Refresh browser when scene becomes active** and **Shutdown source when not visible** unchecked.

### Stingers

Add your Perfect and Winner videos under **Stingers** in WebM format. Use the preview to position the player's photo, character art, and name over the video. Winner playback requires a completed set and can start automatically.

To try it first, use the [sample Winner stinger](examples/stingers/Winner-Placeholder.webm).

Place the Stingers Browser Source above your other OBS sources and reuse it in the scenes where you want playback. Enable **Control audio via OBS** to mix its sound in OBS.

The toolbar's **Stingers** menu lets you play or stop configured clips from any tab. If playback loses its connection, check that the source is in the active OBS scene, then choose **Reconnect OBS source**.

## Player Library

Open **Players** to import players from an event, add a start.gg profile, or create a local player. Save their details and character choices for each game. To use those choices in an exhibition or graphic, select the player from the suggestions as you type their name.

When you select a saved player, changes to their flag, pronouns, social handle, character, or outfit in **Edit stream state** also update their library profile. Name, sponsor, score, and seed changes apply to the current match.

In **Players**, choose **Use imported value** to show the imported start.gg value again. Clearing a field hides its value.

Use **Export library** to back up player records, and back up your image folders separately. **Import library** adds new players and keeps existing local records.

### Scoreboard photos and logos

Enable **Player photos in scoreboards** in **Edit stream state**. Open **Players** to adjust each photo for the selected game and side. Both built-in and custom scoreboards place photos in fixed areas for that game. Player photos are unavailable for Smash Ultimate.

To show a logo behind the photos, choose one option in **Edit stream state**:

- **Tournament logo behind players:** select a logo under **Broadcast extras**.
- **Sponsor logos behind players:** add logos to `sponsors/`, with filenames matching each player's sponsor or prefix.

Selecting one option turns the other off. After adding logo files, choose **Reload assets**.

## Add artwork and photos

Choose **Open assets folder** in the toolbar, or use its dropdown to open a specific folder. Add your files, then choose **Reload assets**.

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

## Custom scoreboards

Import a transparent PNG at `1920×1080`, up to 20 MiB. Position the player names, scores, and other fields over your frame, choose a font under **Appearance**, then choose **Use in OBS**. Your layout appears through the regular Scoreboard source URL.

Layout changes save automatically. Drag a field to move it or use arrow keys for 1 px adjustments and `Shift` + arrows for 10 px. `Alt+click` reaches overlapping fields. **Mirror to Player 1/2** copies a field's size and placement to the opposite side; you can still edit each side separately.

Use **Broadcast extras** to enable the lower information rails and edit their text.

## Top 8 graphics and thumbnails

Top 8 Generator can import completed event standings or use players you enter yourself. YouTube Thumbnail Generator can use the match on stream or a manually entered matchup. Choose the game, fill in the players, and adjust the appearance and artwork in the preview.

Download the finished PNG from the toolbar: Top 8 graphics export at `1920×1080`, and thumbnails at `1280×720`.

You can switch tabs and return to your unfinished graphic. Download it before closing or updating JABS, since generator drafts are not restored after a restart.

## Troubleshooting and support

- **Blank overlay:** check the Browser Source URL and active match, then use OBS's **Refresh cache of current page**. Winner & Champion needs a completed result.
- **Missing image:** check its folder and filename, then reload assets. Keep only one image matching each player or sponsor name.
- **Rejected report:** refresh the set and check your reporting permissions before retrying. Another organizer may have changed the result.

For other problems, open **Help → Diagnostics & support** and export a report. Email **akatsatech@gmail.com** with what happened and roughly when, and attach the report after reviewing it. JABS does not send it automatically. Reports leave out tokens, player text, saved settings, and personal file paths.

If JABS cannot open, its logs are in the application-data folder:

| System | Logs folder |
| --- | --- |
| Windows | `%APPDATA%\gg.jabs.desktop\logs` |
| macOS | `~/Library/Application Support/gg.jabs.desktop/logs` |
| Linux | `$XDG_DATA_HOME/gg.jabs.desktop/logs`, usually `~/.local/share/gg.jabs.desktop/logs` |
