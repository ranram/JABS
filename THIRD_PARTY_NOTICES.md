# Third-Party Notices

JABS uses third-party software, data, fonts, and moderation resources.

This file provides attribution for those components. The original license terms remain controlling and should be retained with source and release distributions where required.

## GLib Rust bindings

- Package: `glib@0.18.5`, with a local security backport
- Source: [gtk-rs/gtk-rs-core](https://github.com/gtk-rs/gtk-rs-core)
- License: MIT. See `vendor/glib/LICENSE` and `vendor/glib/COPYRIGHT`
- Modifications: the upstream `VariantStrIter` fix for RUSTSEC-2024-0429 and compiler-warning syntax cleanup, described in `vendor/README.md`

## App artwork

The project owner supplied the boxing-glove artwork as public-domain material. The original PNG is `src-tauri/app-icon.png`; the header image and platform icons are resized copies.

## Countries States Cities

- Package: `@countrystatecity/countries@1.0.7`
- Source: [dr5hn/countrystatecity-npm](https://github.com/dr5hn/countrystatecity-npm)
- Data source: [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database)
- License: Open Database License (ODbL) 1.0
- Copyright: dr5hn and contributors

JABS uses country and state/province data for offline location selection.

The database requires attribution under the ODbL 1.0. Adapted versions of the database remain subject to the applicable ODbL requirements.

## Moderation resources

JABS uses reviewed word lists to check player tags, pronouns, sponsor names, and other text before it appears in OBS or exported graphics.

A word's inclusion in an upstream list does not mean JABS treats it as offensive in every context. The project reviews these lists and adjusts them to reduce false positives.

### 2Toad Profanity

- Package: `@2toad/profanity@3.3.0`
- Source: [2Toad/Profanity](https://github.com/2Toad/Profanity)
- License: MIT
- Copyright: Copyright (c) 2019 2Toad

JABS uses this package as a reviewed source for profanity detection and moderation.

### List of Dirty, Naughty, Obscene, and Otherwise Bad Words V2

- Project: `List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2`
- Source: [LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2](https://github.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2)
- Repository license: CC0 1.0 Universal
- Upstream sources: [SOURCES.md](https://github.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2/blob/main/SOURCES.md)

JABS uses reviewed portions of these multilingual word lists as build-time moderation data.

The lists help detect abusive or discriminatory text before it appears in tournament broadcasts or exported graphics.

The V2 project is an aggregation of material from multiple earlier profanity and offensive-language resources. Its repository declares CC0 1.0 Universal, while individual upstream sources may have their own licenses and attribution requirements.

JABS therefore treats the collection as reviewed source material rather than executable application code and retains applicable upstream attribution where required.

### Original Shutterstock LDNOOBW list

The V2 project identifies the original Shutterstock List of Dirty, Naughty, Obscene, and Otherwise Bad Words as the starting point for its collection.

- Project: `List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words`
- Source: [LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Copyright: © 2012-2020 Shutterstock, Inc.

This attribution is retained because material originating from the original LDNOOBW collection may be represented in the reviewed moderation data used by JABS.

## Localization

### i18next

- Package: `i18next@26.3.6`
- Source: [i18next/i18next](https://github.com/i18next/i18next)
- License: MIT
- Copyright: Copyright (c) 2011-present i18next

### react-i18next

- Package: `react-i18next@17.0.11`
- Source: [i18next/react-i18next](https://github.com/i18next/react-i18next)
- License: MIT
- Copyright: Copyright (c) 2015-present i18next

JABS uses i18next and react-i18next for its bundled English and Latin American Spanish interface.

## Anime.js

- Package: `animejs@4.5.0`
- Source: [juliangarnier/anime](https://github.com/juliangarnier/anime)
- License: MIT
- Copyright: Copyright (c) 2025 Julian Garnier

JABS uses Anime.js for short OBS overlay entrances.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Phosphor Icons

- Package: `@phosphor-icons/react@2.1.10`
- Source: [phosphor-icons/react](https://github.com/phosphor-icons/react)
- License: MIT
- Copyright: Copyright (c) 2020 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Flag Icons

- Package: `flag-icons@7.3.0`
- Source: [lipis/flag-icons](https://github.com/lipis/flag-icons)
- License: MIT
- Copyright: Copyright (c) 2013 Panayiotis Lipiridis

JABS bundles SVG country flags for offline use in the application and OBS overlays. No remote flag service or operating-system emoji support is required.

## Bundled display fonts

JABS bundles the following fonts from the Google Fonts repository for offline graphics and OBS overlays:

- **Anton Regular**: Copyright 2020 The Anton Project Authors
- **Archivo Black Regular**: Copyright 2017 The Archivo Black Project Authors
- **Barlow Condensed Regular and Bold**: Copyright 2017 The Barlow Project Authors
- **Bebas Neue Regular**: Copyright © 2010 Dharma Type
- **Bungee Shade Regular**: Copyright 2023 The Bungee Project Authors
- **Inter Variable**: Copyright 2020 The Inter Project Authors
- **Lato Regular and Bold**: Copyright (c) 2010–2014 by tyPoland Lukasz Dziedzic
- **Montserrat Variable**: Copyright 2024 The Montserrat.Git Project Authors
- **Oswald Variable**: Copyright 2016 The Oswald Project Authors
- **Oxanium Variable**: Copyright 2019 The Oxanium Project Authors
- **Titan One Regular**: Copyright (c) 2011 Rodrigo Fuenzalida

Each font is licensed under the **SIL Open Font License 1.1**.

The original license texts are included under `font-licenses/` in desktop resources and beside the source font files. JABS does not contact Google Fonts at runtime.

## Driver.js

- Package: `driver.js@1.9.0`
- Source: [nilbuild/driver.js](https://github.com/nilbuild/driver.js)
- License: MIT

The MIT License

Copyright (c) Kamran Ahmed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
