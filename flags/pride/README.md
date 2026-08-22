# Pride flags

These optional display flags appear after countries in JABS. Choosing one changes only the flag shown on overlays and generated graphics; it does not replace country, state, or pronoun data.

To add an identity to a custom build:

1. Place a safe, self-contained SVG in this directory. Do not use scripts, external images, remote links, or embedded executable content.
2. Add its ID, display label, and filename to `src/shared/prideFlags.json`.
3. Rebuild JABS.

The ID must begin with `pride:` and use only lowercase letters, numbers, and hyphens. The filename may use letters, numbers, and hyphens. Keep the artwork centered in its SVG view box so it aligns with country flags.

JABS discovers SVGs in this directory during the build. It accepts selections only when their IDs are present in the compiled catalog.
