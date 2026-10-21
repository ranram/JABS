# Scoreboard masks and photo backings

Use these files to fit player photos or cameras into your own broadcast layout. Each set uses a transparent `1920×1080` canvas, with matching SVG and PNG files.

| Files | Use |
| --- | --- |
| `mask-left`, `mask-right` | White apertures for clipping one player's photo |
| `mask` | Both photo apertures |
| `frame-left`, `frame-right` | Dark, opaque backing for one photo |
| `frame` | Both photo backings |

Place the backing beneath the photo and apply the matching mask to the photo's alpha channel. Keep the layers aligned with the full game capture. Use PNG files in your broadcast setup or edit the SVG geometry in a graphics editor.

Check alignment against your game capture before broadcasting, especially if you change its crop or HUD scale. For JABS's built-in photo controls, see the [Player Library instructions](../USER_MANUAL.md#player-library).
