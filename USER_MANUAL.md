# JABS User Manual

This guide walks tournament organizers and stream crews through a normal JABS workflow.

For installation and source builds, see [README.md](README.md). For code changes and deeper customization, see [TECH_MANUAL.md](TECH_MANUAL.md).

## Quick start

Before your first tournament:

1. Open JABS.
2. Add a start.gg token if you plan to report results or want authenticated browsing.
3. Load a tournament and event.
4. Click a set and choose **Send to Stream**.
5. Copy the Scoreboard URL from the sticky actions bar into a `1920×1080` OBS Browser Source.
6. Change a score in JABS and confirm that OBS updates.
7. Add any logos or artwork you need.
8. Test one result report only on a bracket you are allowed to manage.

Keep JABS open while OBS uses a JABS source.

To update an installed release, use **Check for updates** in the header, then **Update now** when a newer version is available. Finish pending saves and export any unfinished graphics first. Installation restarts JABS, so OBS sources briefly disconnect. Linux distribution packages use their package manager; the AppImage supports in-app updates.

## 1. Connect to start.gg

You can browse public tournaments, load sets, and control OBS without a token. Add one when you need to report results to start.gg or use authenticated browsing.

- **Save token** uses your operating system's secure credential store.
- **Session token** keeps it only until JABS closes.
- JABS never saves a token as plaintext.

**Token stored** means the token was saved. **API verified** means start.gg accepted it.

Use a token from an account that can access the tournament. Reporting also requires permission to report that bracket.

## 2. Load a tournament

Enter either:

- A tournament slug, such as `my-weekly-42`.
- An official HTTPS start.gg tournament URL.

Choose the event after it loads.

JABS normally detects the game. If the game is not recognized, choose a **Game profile for set** before loading a set.

**Styling** changes colors and presentation only. It does not change the event's game, character list, or reporting rules.

### Sticky actions bar

The actions bar stays below the main tabs while you scroll:

- **Edit allowlist** opens the moderation exceptions editor. Saving applies the changes immediately.
- **Reload allowlist** applies changes made to the file outside JABS.
- **Reload assets** rescans artwork, photos, and logos.
- **Refresh set selector** fetches the latest sets for the current filters.
- **Refresh current set** updates the on-stream set and its Versus history while keeping its styling and broadcast extras.
- **Clear bracket history** resets the bracket browser and removes recent tournament history.

Hover over any of these buttons for a short description.

## 3. Find a set

Use these optional filters:

- **Phase**
- **Pool / phase group**
- **Station**

The **Filter By** pills can also narrow loaded sets by status, station, or assigned stream.

Scroll down to load more sets. JABS keeps start.gg's bracket order.

Use **Search sets** to find a player, round, station, score, or set ID. Search scans the full selected event, phase, pool, or station—even sets that have not appeared on screen yet.

Large searches may take time. Select a phase or pool first when possible. You can cancel a search in progress.

Set labels include:

- Pending
- On Stream
- Completed
- Station
- Assigned Twitch or YouTube channel for upcoming sets

Stream pills read `Twitch · Stream Name` or `YouTube · Stream Name`. JABS checks both the tournament stream queue and the assignment saved on the set. Completed sets leave this pill hidden.

## 4. Choose what to do with a set

Click anywhere on a set row.

### Send to Stream

Loads the set into the active OBS overlays.

### Quick Score Update

Reports a bracket set without changing the match currently shown in OBS.

1. Enter the score with `−` and `+`.
2. Check the winner and set ID.
3. Choose **Confirm & update bracket**.
4. Confirm the start.gg update.

JABS checks the live set again before reporting. If someone else changed it, JABS stops instead of overwriting their work.

## 5. Edit the stream match

After using **Send to Stream**, use **Edit stream state**.

Changes save automatically. Text stays local while you type. JABS checks the completed value after about 1.5 seconds without typing, or immediately when you leave the field. It reaches OBS only after the native check accepts the complete stream state.

If text is rejected:

- A toast names the field.
- The text remains available for correction.
- **Not sent to OBS** confirms viewers did not receive it.

If JABS blocks a legitimate tag or sponsor, choose **Edit allowlist** in the sticky actions bar. Add the complete value on its own line and save. JABS applies the change immediately. Matching ignores capitalization but applies only to the complete field value, so allowing one tag does not weaken checks inside other text.

### Match details

You can edit:

- Styling
- Best of 3 or Best of 5
- Display name
- Round
- Station

The detected game name comes from start.gg. Styling is independent from game detection.

### Player details

Each player has:

- Tag and prefix
- Characters and sponsor
- Display flag and state/province
- Pronouns and seed

The display-flag dropdown is searchable. It lists countries first and optional Pride flags afterward. Choosing a Pride flag changes only what appears on graphics; it keeps any country and state imported from start.gg. The first selected character is the lead artwork. Character-aware graphics can also show the full team's portraits.

### Broadcast extras

Open the accordion to enable:

- Bottom-left and bottom-right text rails
- A tournament or organizer logo

Changing this logo also updates the Versus Screen, Winner & Champion, Top 8 Matchups, and Commentators when their tournament-logo switches are on.

### Refresh current set

Use **Refresh current set** when the set already on stream needs the newest start.gg names, scores, round, station, detected game, or head-to-head history. It keeps your current Styling and broadcast extras. Head-to-head history requires linked start.gg player profiles. To update the list of available sets instead, use **Refresh set selector**.

If an unplayed set remains marked complete after you reset it on start.gg, use **Refresh current set** to import its corrected status and score.

## 6. Score and report the streamed set

Use the Live Controls `−` and `+` buttons after every game.

- Lowering a score corrects that player's most recent recorded game win.
- **Reset scores** starts a new empty game history.
- **Swap players** keeps wins attached to the correct entrants.

When the set is complete, **Report result** shows the winner, score, and set ID before asking for confirmation.

If every game was entered in JABS, it can send the exact ordered game history. If JABS imported an existing nonzero score without game order, it safely reports only W/L. Reset and re-enter the full result when an exact score is required.

JABS never reports automatically.

### Keyboard shortcuts

Turn shortcuts on or off from the sticky actions bar. They pause while you type, edit an unsaved match, use the set-action window, or wait for a save.

- `1`: add a point to Player 1
- `2`: add a point to Player 2
- `Shift+1`: subtract a point from Player 1
- `Shift+2`: subtract a point from Player 2
- `Ctrl+Shift+R`: reset both scores
- `Ctrl+Shift+S`: swap players
- `Ctrl+Shift+C`: swap commentators

## 7. Add JABS to OBS

Create an OBS **Browser Source** with:

- Width: `1920`
- Height: `1080`
- Custom CSS: none

Copy the complete URL from the dropdown in the sticky actions bar. The port can change, so do not guess it.

| Source | Route |
| --- | --- |
| Scoreboard | `/overlay/active/main` |
| Winner & Champion | `/overlay/active/winner` |
| Versus Screen | `/overlay/active/versus` |
| Top 8 Matchups | `/overlay/active/top-eight-matchups` |
| Commentators | `/overlay/commentators` |

If OBS loaded while JABS was closed, open JABS and use **Refresh cache of current page** in the Browser Source properties.

The Winner source stays empty until the active set has a winner. It automatically uses the Champion presentation when the bracket context confirms a champion.

The older `/overlay/active/champion` route remains available for OBS scenes created before Winner and Champion were combined.

## 8. Use a custom scoreboard

The **Custom Scoreboard** tab lets you place JABS match information over your own scoreboard artwork.

1. Send a set to stream.
2. Prepare a transparent PNG that is exactly `1920×1080` and no larger than 20 MiB.
3. Enter a name, choose the PNG, and select **Import scoreboard**.
4. Choose the item you want to adjust, such as a player name, score, flag, round, logo, or lower rail.
5. Drag the selected item in the preview, or use the arrow keys. Hold Shift for larger steps.
6. Choose which details to show and adjust their alignment, size, color, or outline.
7. Select **Save layout**. If the scoreboard is not already active, choose **Use in OBS**.

Player details remain within their side of the top scoreboard area. Tournament logos and lower rails remain within the bottom area. These limits keep text from wandering into the middle of the game screen.

The regular active-scoreboard URL does not change. To return to a built-in game layout, choose **Use automatic styling** or select a Styling in **Edit stream state**.

## 9. Other Overlays

Open the **Other Overlays** tab.

Copy the browser-source URL from the dropdown in the sticky actions bar, then set the OBS source to `1920×1080`.

Versus Screen, Winner & Champion, and Top 8 Matchups can hide the full-screen JABS background. Use transparent mode when you want your own OBS image or video underneath; information panels and player details remain visible.

### Top 8 Matchups

Load a start.gg event, open **Top 8 Matchups**, and select **Find matchups from the loaded event**. When start.gg provides a phase named **Top 8**, JABS reads that phase directly. Otherwise, JABS traces the bracket backward from Grand Finals to find the two opening Winners matches and two opening Losers matches. Confirm one character for each player. The selector includes the game's full roster, even when some portraits have not been added. If a selected character has no portrait, the overlay displays the character's name in its place. Use the **User media folders** section to open the portrait or tournament-logo folders. The overlay displays the saved matchups as soon as its browser source is open; there is no separate visibility switch.

JABS trusts the character names included in its reviewed game rosters. Character names added through local media files still pass through moderation. Add a legitimate custom name to the moderation allowlist if JABS blocks it.

Use **Show tournament logo** to control the event logo. **Flip Player 2 portraits** changes the orientation of every portrait on the right side.

### Versus Screen

1. Send a set to stream.
2. Choose a Styling.
3. Choose Character Art or Player Photos.
4. Toggle tournament and sponsor logos.
5. Optionally refresh start.gg history.
6. Select a media layer in the adjustment dropdown.
7. Drag it, or use the keyboard.

Controls:

- Arrow: move
- Shift+arrow: move farther
- `+` / `-`: resize
- `F`: flip the selected artwork horizontally
- Reset: restore the default

Artwork keeps its original orientation on both sides until you flip it.

After you stop moving the image, OBS updates in about two seconds.

### Winner & Champion

The accordion shows the current winner. Choose a Styling and turn available items on or off:

- Tournament logo
- Player photo
- Sponsor logo
- Character art

### Commentators

Enter the tournament, logo, and both commentator identities. Then choose:

- **Present for 10 seconds**
- **Show persistently**
- **Hide**

Use **Show tournament logo** to show or hide the selected event logo. Choose **Swap commentators** or press `Ctrl+Shift+C` to exchange their sides.

## 10. Add logos, photos, and character art

Media sections show the exact folder JABS uses. Choose **Open folder** instead of finding it manually.

Use PNG, JPEG, or WebP files.

| Media | Folder and naming |
| --- | --- |
| Tournament logo | `tourney-logos/<Logo>.png` |
| Sponsor logo | `sponsors/<Sponsor or Prefix>.webp` |
| Player photo | `players/<Player Tag>.webp` |
| Full character art | `game-assets/<game>/characters/<Character>.png` |
| Square portrait | `game-assets/<game>/portraits/<Character>.webp` |

For supported games, filenames may use a canonical character name or one of the aliases in that game's catalog. Games without a built-in catalog use the names found in their asset folders. Player and sponsor media still match their displayed names. Examples:

```text
sponsors/BEAST.webp
players/MenaRD.webp
game-assets/street-fighter-6/characters/Elena.png
game-assets/street-fighter-6/portraits/Elena.webp
```

For portraits, use a `384×384` square PNG or WebP with the face and upper body near the center. The same portrait works with Top 8 Matchups, the Versus Screen, Top 8 graphics, and YouTube thumbnails. Keep important details away from the outer edges because each layout may frame the image differently. JABS does not detect or reposition faces automatically.

To add colors or outfits for one character, add a number to each filename:

```text
game-assets/super-smash-bros-ultimate/characters/Mario-1.png
game-assets/super-smash-bros-ultimate/characters/Mario-2.png
```

JABS keeps both files under Mario and shows a **Color / outfit** selector. Use the same number in `characters/` and `portraits/` when the images belong together. The [Game artwork guide](game-assets/README.md) lists every supported filename style.

Choose **Reload assets** after adding or replacing any local media, including tournament logos. You do not need to restart JABS.

## 11. Create a Top 8 graphic

Top 8 files download as `1920×1080` PNGs.

JABS automatically tries to load the active event's finalized Top 8. You may also:

- Enter another completed start.gg event URL.
- Fill all eight placements manually.

Then:

1. Choose Styling.
2. Choose Mosaic or Neon. Neon is selected by default.
3. Choose Character Art or Player Photos.
4. Enter the tournament and headline.
5. Optionally choose a logo and background.
6. Check all eight players.
7. Select a player image to move or resize it.
8. Download the PNG.

The expected order is first, second, third, fourth, tied fifth, and tied seventh. JABS does not replace your manual draft with incomplete or unusual standings.

## 12. Create a YouTube thumbnail

Thumbnails download as `1280×720` PNGs.

A newly streamed set fills the thumbnail automatically. Choose **Use stream match** to fill it again, or enter both players manually.

1. Choose Styling.
2. Choose Versus or Spotlight.
3. Choose Character Art or Player Photos.
4. Enter the tournament and headline.
5. Choose logo options and, if wanted, a custom background image.
6. Check both players and their characters.
7. Select an image to move, resize, or flip it with `F`.
8. Download the PNG.

Both player sides keep the artwork’s original orientation until you flip it.

## 13. Quick fixes

### Overlay is blank

- Keep JABS open.
- Send a set to stream.
- Check the complete OBS URL.
- Refresh the OBS Browser Source.
- Complete the score before testing Winner/Champion.

### Image is missing

- Use PNG, JPEG, or WebP.
- Check the folder shown by JABS.
- Match the player, sponsor, or character filename.
- Choose **Reload assets** after adding or replacing the file.

### Search is slow

Choose a Phase or Pool, or wait for the page progress. Cancel if you no longer need it.

### Report is rejected

- Refresh the bracket.
- Check whether another organizer updated the set.
- Confirm your start.gg account can report the tournament.
- Do not repeatedly retry an uncertain report.

### A field is blocked

Correct the named field and leave it again. Blocked text was not sent to OBS.

### Bracket data looks stale

Choose **Refresh set selector**. Use **Clear bracket history** to reset the browser and remove recent tournament history. It keeps the active stream state and saved set edits.

## 14. End of the event

1. Check the final bracket on start.gg.
2. Download the graphics you still need.
3. Hide the commentator overlay.
4. Remove the token if the computer is shared.
5. Wait for any pending autosave before closing JABS.
