<p align="center">
  <img src="src/renderer/src/assets/jabs-logo.svg" alt="JABS logo" width="480">
</p>

# JABS: Just Another Bracketing System

JABS helps fighting game organizers run tournaments and broadcasts from their computer. It loads brackets from [start.gg](https://www.start.gg/), keeps the current match ready for stream, updates scores, and sends transparent overlays to OBS.

It is designed for organizers handling the bracket and stream themselves, with tools for match reporting, broadcast graphics, and match-upload thumbnails.

Public brackets work without a token. Reporting results requires a start.gg token and confirmation. Settings, player profiles, and media stay on your computer.

## What JABS can do

- Browse start.gg brackets, send matches to stream, and report results.
- Run exhibitions, including first-to matches and Topanga Rules.
- Queue stream matches and show upcoming matches or recent results in an OBS ticker.
- Show live scoreboards, match previews, results, player stats, brackets, and commentators in OBS.
- Save player profiles, photos, and character choices for future matches.
- Customize your overlays with local artwork, fonts, logos, and scoreboard frames.
- Play Perfect and Winner stingers with player artwork.
- Create Top 8 graphics and YouTube thumbnails from tournament results or your own matchups.

The interface includes English and Latin American Spanish, with a separate language choice for OBS.

## Install

Download a package for your operating system from [Releases](https://github.com/ranram/jabs/releases). In-app updates are available for supported release packages.

## Screenshots

<table>
  <tr>
    <td width="50%"><strong>Bracket and stream controls</strong><br><img src="screenshots/StreamState.png?v=1.6.2" alt="JABS bracket and stream controls"></td>
    <td width="50%"><strong>Versus Screen</strong><br><img src="screenshots/VersusScreen.png" alt="JABS Versus Screen preview"></td>
  </tr>
  <tr>
    <td width="50%"><strong>YouTube thumbnail generator</strong><br><img src="screenshots/Thumbnails.png" alt="JABS YouTube thumbnail generator"></td>
    <td width="50%"><strong>Top 8 generator</strong><br><img src="screenshots/Top8Generation.png" alt="JABS Top 8 graphic generator"></td>
  </tr>
</table>

## Supported games

JABS includes built-in scoreboard styles and game rules for:

- Street Fighter 6
- Tekken 8
- Avatar Legends
- MARVEL Tōkon: Fighting Souls
- Guilty Gear Strive
- 2XKO
- BlazBlue Centralfiction
- Fatal Fury: City of the Wolves
- Granblue Fantasy Versus: Rising
- The King of Fighters XV
- Melty Blood: Type Lumina
- Mortal Kombat 1
- Ultimate Marvel vs. Capcom 3
- Super Smash Bros. Ultimate
- Under Night In-Birth II Sys:Celes

Other fighting games are available through the searchable **Game** list or their start.gg events. They can use an existing rules profile while keeping their own game name and artwork.

## Get started

1. Load a start.gg tournament URL or slug, open **Set Selector**, and choose an event and match to send to stream. For exhibitions, choose a game and enter the players directly.
2. Choose a source from **Copy overlay URL** in the toolbar, then paste its URL into an OBS Browser Source at `1920×1080`.
3. Keep JABS running and update scores from **Edit stream state**.

Choose **Help** for in-app tutorials. The [User Manual](USER_MANUAL.md) covers artwork, overlays, and [connecting to start.gg for reporting](USER_MANUAL.md#connect-to-startgg).

## On Uninstall

JABS keeps saved data in these folders after uninstalling:

| System | App data folder |
| --- | --- |
| Windows | `%APPDATA%\gg.jabs.desktop` |
| macOS | `~/Library/Application Support/gg.jabs.desktop` |
| Linux | `$XDG_DATA_HOME/gg.jabs.desktop`, usually `~/.local/share/gg.jabs.desktop` |

Older Windows uninstallers may still offer to delete app data.

## Develop

See the [Technical Manual](TECH_MANUAL.md#development-tools) for source setup, development commands, and contributor checks. Installed copies do not require development tools.

## License and support

Original code and documentation use [Apache 2.0](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) and [asset licensing](ASSET_LICENSES.md) for other material, and [SECURITY.md](SECURITY.md) to report a vulnerability.

For help, use **Help → Diagnostics & support** in JABS or email **akatsatech@gmail.com**.

Support development through [Ko-fi](https://ko-fi.com/ranram).
