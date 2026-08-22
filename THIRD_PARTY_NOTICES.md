# Third-Party Notices

JABS uses third-party software, data, fonts, and moderation resources.

This file provides attribution for those components. The original license terms remain controlling and should be retained with source and release distributions where required.

## Countries States Cities

- Package: `@countrystatecity/countries@1.0.7`
- Source: [dr5hn/countrystatecity-npm](https://github.com/dr5hn/countrystatecity-npm)
- Data source: [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database)
- License: Open Database License (ODbL) 1.0
- Copyright: dr5hn and contributors

JABS uses country and state/province data for offline location selection.

The database requires attribution under the ODbL 1.0. Adapted versions of the database remain subject to the applicable ODbL requirements.

## Moderation resources

JABS uses reviewed profanity and offensive-language resources to help prevent malicious or abusive text from reaching broadcast-facing surfaces.

This includes user-controlled or imported fields such as player tags, pronouns, sponsor information, and other text that may appear in OBS overlays or generated graphics.

These resources are moderation inputs. Inclusion of a word or phrase in an upstream list does not mean that JABS endorses the list's classification in every language, culture, or context. Moderation data may be reviewed, normalized, excluded, or supplemented to reduce false positives.

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

The lists help detect abusive, obscene, discriminatory, or otherwise inappropriate text supplied by malicious users before that text can appear in tournament broadcasts or exported graphics.

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

## Flag Icons

- Package: `flag-icons@7.3.0`
- Source: [lipis/flag-icons](https://github.com/lipis/flag-icons)
- License: MIT
- Copyright: Copyright (c) 2013 Panayiotis Lipiridis

JABS bundles SVG country flags for offline use in the application and OBS overlays. No remote flag service or operating-system emoji support is required.

## Generator display fonts

JABS bundles the following fonts from the Google Fonts repository for offline Top 8 and YouTube thumbnail rendering:

- **Bebas Neue Regular**: Copyright © 2010 Dharma Type
- **Anton Regular**: Copyright 2020 The Anton Project Authors
- **Titan One Regular**: Copyright © 2011 Rodrigo Fuenzalida; Reserved Font Name: Titan
- **Bungee Shade Regular**: Copyright 2023 The Bungee Project Authors

Each font is licensed under the **SIL Open Font License 1.1**.

The corresponding license text is distributed with the bundled font files. JABS does not contact Google Fonts at runtime.
