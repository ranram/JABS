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

JABS compares each filename with the character name while ignoring capitalization, spaces, punctuation, and accents. For example, `Chun-Li.webp` matches `Chun Li`, and `AKI.png` matches `A.K.I.`.

You can also use recognized alternate names. In Street Fighter 6, `Bison.png` and `Dictator.png` both match M. Bison, while `Viper.png` matches C. Viper. In Smash Ultimate, `Koopa.png` matches Bowser and `Purin.png` matches Jigglypuff. Numbered versions work too, such as `Bison2.png` or `Koopa3.png`.

Keep one image per character and outfit in each folder. If you have both `M.Bison2.png` and `Bison2.png`, JABS uses `M.Bison2.png` because it matches the roster name. Other duplicate matches are chosen by filename in alphabetical order.

For a game without a built-in roster, your filenames supply the character names. No roster file is needed.

## Add colors or outfits

Add a number to the end of a character's filename when you want to provide more than one color or outfit:

```text
game-assets/
  super-smash-bros-ultimate/
    characters/
      Mario-1.png
      Mario-2.png
      Mario-3.png
    portraits/
      Mario-1.png
      Mario-2.png
      Mario-3.png
```

JABS groups these files under Mario and adds a Color / outfit selector with options 1, 2, and 3. If you include an unnumbered `Mario.png`, it appears as the Default option.

The number can follow the name directly or use spaces, dashes, parentheses, or brackets. These filenames all work:

```text
Mario1.png
Mario-2.png
Mario 3.png
Mario (4).png
Mario [5].png
```

Use the same number in `characters/` and `portraits/` when both images belong to the same color or outfit. The spelling does not have to be identical: JABS ignores capitalization and common punctuation when matching character names. For example, `Mr Game and Watch 1.png` and `Mr. Game & Watch (1).webp` belong to the same character and outfit.

After adding or replacing images, use **Reload assets** in JABS. You do not need to restart the app.

Files must be PNG, JPEG, or WebP, no larger than 20 MiB, and must contain the image format named by their extension. JABS does not accept SVG files, animations, extra folders beneath `characters/` or `portraits/`, or paths outside this catalog.

Installed copies use the same folder structure inside the JABS app-data folder. Only add artwork you have permission to display or share.
