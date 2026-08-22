# Game artwork

Place character artwork in a folder named after the game's slug:

```text
game-assets/
  street-fighter-6/
    characters/
      Chun-Li.webp
      Ryu.png
    portraits/
      Chun-Li.webp
      Ryu.png
```

Use `characters/` for full artwork and `portraits/` for square face or bust images. Give both images the same character filename when you provide both.

JABS compares each filename with the character name while ignoring capitalization, spaces, punctuation, and accents. For example, `Chun-Li.webp` matches `Chun Li`. If two files resolve to the same name, JABS uses neither because it cannot choose safely.

Files must be PNG, JPEG, or WebP, no larger than 20 MiB, and must contain the image format named by their extension. JABS does not accept SVG files, animations, symlinks, extra folders beneath `characters/` or `portraits/`, or paths outside this catalog.

Installed copies use the same folder structure inside the JABS app-data folder. Only add artwork you have permission to display or share.
