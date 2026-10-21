# Game artwork

Select a game in JABS to create its folders:

```text
game-assets/<game-slug>/
  characters/Ryu.png
  portraits/Ryu.webp
```

Use `characters/` for full artwork and `portraits/` for square face or bust images. Replace generated empty `.png` files with your images; JPEG and WebP with the same character name also work. Empty placeholders are ignored.

## Filenames

Matching ignores capitalization, spaces, punctuation, and accents: `AKI.png` matches A.K.I. Built-in rosters also recognize game-specific aliases, such as `Dictator.png` for M. Bison in Street Fighter 6. Keep one image per character and outfit in each folder.

Add numbered suffixes for colors or outfits: `Mario-1.png`, `Mario-2.png`. An unnumbered `Mario.png` is the default. Use the same outfit number in `characters/` and `portraits/` when providing both.

For games without a built-in roster, JABS can load character names from start.gg or use the names of your image files.

## Files and reloads

Use PNG, JPEG, or WebP up to 20 MiB. Put images directly in `characters/` or `portraits/`; nested image folders, SVG, and animated images are unsupported. Choose **Reload assets** after adding or replacing files.

Installed copies use this structure inside JABS's app-data directory; **Open folder** in JABS locates it. Only add artwork you have permission to use or share.
