import matchFormatPoliciesJson from './matchFormatPolicies.json';

export type GameId =
  | 'street-fighter-6'
  | 'tekken-8'
  | 'avatar-legends'
  | 'marvel-tokon'
  | 'guilty-gear-strive'
  | '2xko'
  | 'blazblue-centralfiction'
  | 'fatal-fury-city-of-the-wolves'
  | 'granblue-fantasy-versus-rising'
  | 'king-of-fighters-xv'
  | 'melty-blood-type-lumina'
  | 'mortal-kombat-1'
  | 'ultimate-marvel-vs-capcom-3'
  | 'super-smash-bros-ultimate'
  | 'under-night-in-birth-ii-sys-celes';

export type ScoreMode = 'games' | 'rounds' | 'custom';

export type OverlayTemplateId =
  | 'sf6-drive'
  | 'tekken-engager'
  | 'avatar-bending'
  | 'tokon-assemble'
  | 'strive-daredevil'
  | '2xko-duo'
  | 'blazblue-astral'
  | 'cotw-rev'
  | 'granblue-skybound'
  | 'kof-max'
  | 'melty-moon'
  | 'mk1-brutality'
  | 'umvc3-hyper'
  | 'smash-stock'
  | 'under-night-grd';

export type OverlayHudSafeZone = {
  top: number;
  bottom: number;
  sidePadding: number;
  centerWidth: number;
  gap: number;
};

export type OverlayBroadcastSafeZone = {
  bottom: number;
  height: number;
  railWidth: number;
  centerWidth: number;
  logoHeight: number;
  logoAnchor?: 'bottom-center' | 'top-center' | 'upper-center';
  logoTop?: number;
};

export type GameProfile = {
  id: GameId;
  label: string;
  shortLabel: string;
  styleName: string;
  scoreMode: ScoreMode;
  maxScore: number;
  terminology: {
    set: string;
    game: string;
    playerOne: string;
    playerTwo: string;
  };
  overlay: {
    template: OverlayTemplateId;
    themeClass: string;
    accent: string;
    background: string;
    hudSafeZone: OverlayHudSafeZone;
    broadcastSafeZone: OverlayBroadcastSafeZone;
    showMatchChip?: boolean;
  };
  editableFields: Array<'character' | 'team' | 'country' | 'state' | 'pronouns' | 'seed' | 'sponsor'>;
};

export const gameProfiles: Record<GameId, GameProfile> = {
  'street-fighter-6': {
    id: 'street-fighter-6',
    label: 'Street Fighter 6',
    styleName: 'Hit the Streets [SF6]',
    shortLabel: 'SF6',
    scoreMode: 'games',
    maxScore: 3,
    terminology: {
      set: 'Set',
      game: 'Game',
      playerOne: 'P1',
      playerTwo: 'P2'
    },
    overlay: {
      template: 'sf6-drive',
      themeClass: 'theme-sf6',
      accent: '#f7b733',
      background: '#19110c',
      hudSafeZone: {
        top: 4,
        bottom: 60,
        sidePadding: 250,
        centerWidth: 310,
        gap: 60
      },
      broadcastSafeZone: { bottom: 5, height: 22, railWidth: 500, centerWidth: 180, logoHeight: 64 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'tekken-8': {
    id: 'tekken-8',
    label: 'Tekken 8',
    styleName: 'Heat Engager [T8]',
    shortLabel: 'T8',
    scoreMode: 'games',
    maxScore: 3,
    terminology: {
      set: 'Set',
      game: 'Game',
      playerOne: 'Left',
      playerTwo: 'Right'
    },
    overlay: {
      template: 'tekken-engager',
      themeClass: 'theme-t8',
      accent: '#30d5ff',
      background: '#080d17',
      hudSafeZone: {
        top: 4,
        bottom: 46,
        sidePadding: 240,
        centerWidth: 400,
        gap: 70
      },
      broadcastSafeZone: { bottom: 5, height: 22, railWidth: 520, centerWidth: 180, logoHeight: 62 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'avatar-legends': {
    id: 'avatar-legends',
    label: 'Avatar Legends',
    styleName: 'Bending Arts [AL]',
    shortLabel: 'AL',
    scoreMode: 'games',
    maxScore: 3,
    terminology: {
      set: 'Set',
      game: 'Game',
      playerOne: 'P1',
      playerTwo: 'P2'
    },
    overlay: {
      template: 'avatar-bending',
      themeClass: 'theme-avatar-legends',
      accent: '#62d47b',
      background: '#0d1711',
      hudSafeZone: {
        top: 4,
        bottom: 60,
        sidePadding: 260,
        centerWidth: 320,
        gap: 40
      },
      broadcastSafeZone: { bottom: 5, height: 22, railWidth: 510, centerWidth: 170, logoHeight: 62 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'marvel-tokon': {
    id: 'marvel-tokon',
    label: 'Marvel Tōkon',
    styleName: 'Assemble! [MT]',
    shortLabel: 'MT',
    scoreMode: 'games',
    maxScore: 3,
    terminology: {
      set: 'Set',
      game: 'Game',
      playerOne: 'P1',
      playerTwo: 'P2'
    },
    overlay: {
      template: 'tokon-assemble',
      themeClass: 'theme-tokon',
      accent: '#ff3b30',
      background: '#130c10',
      hudSafeZone: {
        top: 2,
        bottom: 38,
        sidePadding: 430,
        centerWidth: 300,
        gap: 30
      },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 500, centerWidth: 170, logoHeight: 64 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'guilty-gear-strive': {
    id: 'guilty-gear-strive',
    label: 'Guilty Gear Strive',
    styleName: 'Here Comes Daredevil [GGST]',
    shortLabel: 'GGST',
    scoreMode: 'games',
    maxScore: 3,
    terminology: {
      set: 'Set',
      game: 'Game',
      playerOne: 'P1',
      playerTwo: 'P2'
    },
    overlay: {
      template: 'strive-daredevil',
      themeClass: 'theme-ggst',
      accent: '#e54838',
      background: '#171310',
      hudSafeZone: {
        top: 4,
        bottom: 52,
        sidePadding: 260,
        centerWidth: 400,
        gap: 70
      },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 500, centerWidth: 180, logoHeight: 64 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  '2xko': {
    id: '2xko',
    label: '2XKO',
    styleName: 'Double Down [2XKO]',
    shortLabel: '2XKO',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'Blue', playerTwo: 'Red' },
    overlay: {
      template: '2xko-duo',
      themeClass: 'theme-2xko',
      accent: '#21e6b2',
      background: '#17101f',
      hudSafeZone: { top: 2, bottom: 38, sidePadding: 430, centerWidth: 360, gap: 20 },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 460, centerWidth: 180, logoHeight: 64 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'blazblue-centralfiction': {
    id: 'blazblue-centralfiction',
    label: 'BlazBlue Centralfiction',
    styleName: 'Wheel of Fate [BBCF]',
    shortLabel: 'BBCF',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'blazblue-astral',
      themeClass: 'theme-bbcf',
      accent: '#69dff5',
      background: '#101727',
      hudSafeZone: { top: 3, bottom: 43, sidePadding: 470, centerWidth: 360, gap: 10 },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 490, centerWidth: 170, logoHeight: 62 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'fatal-fury-city-of-the-wolves': {
    id: 'fatal-fury-city-of-the-wolves',
    label: 'Fatal Fury: City of the Wolves',
    styleName: 'REV Blow [CotW]',
    shortLabel: 'COTW',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'cotw-rev',
      themeClass: 'theme-cotw',
      accent: '#ffe02e',
      background: '#151118',
      hudSafeZone: { top: 3, bottom: 39, sidePadding: 300, centerWidth: 360, gap: 50 },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 480, centerWidth: 170, logoHeight: 62 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'granblue-fantasy-versus-rising': {
    id: 'granblue-fantasy-versus-rising',
    label: 'Granblue Fantasy Versus: Rising',
    styleName: 'Skybound Art [GBVSR]',
    shortLabel: 'GBVSR',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'granblue-skybound',
      themeClass: 'theme-gbvsr',
      accent: '#71d9ff',
      background: '#101b29',
      hudSafeZone: { top: 2, bottom: 36, sidePadding: 360, centerWidth: 400, gap: 30 },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 470, centerWidth: 180, logoHeight: 62 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'king-of-fighters-xv': {
    id: 'king-of-fighters-xv',
    label: 'The King of Fighters XV',
    styleName: 'MAX MODE [KOFXV]',
    shortLabel: 'KOF XV',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'kof-max',
      themeClass: 'theme-kofxv',
      accent: '#23cce5',
      background: '#101419',
      hudSafeZone: { top: 3, bottom: 39, sidePadding: 260, centerWidth: 520, gap: 80 },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 460, centerWidth: 180, logoHeight: 62 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'melty-blood-type-lumina': {
    id: 'melty-blood-type-lumina',
    label: 'Melty Blood: Type Lumina',
    styleName: 'Magic Circuit [MBTL]',
    shortLabel: 'MBTL',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'melty-moon',
      themeClass: 'theme-mbtl',
      accent: '#d9c2ff',
      background: '#17111d',
      hudSafeZone: { top: 38, bottom: 72, sidePadding: 320, centerWidth: 380, gap: 80 },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 460, centerWidth: 170, logoHeight: 60 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'mortal-kombat-1': {
    id: 'mortal-kombat-1',
    label: 'Mortal Kombat 1',
    styleName: 'Fatality [MK1]',
    shortLabel: 'MK1',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'mk1-brutality',
      themeClass: 'theme-mk1',
      accent: '#d8ad62',
      background: '#17120d',
      hudSafeZone: { top: 3, bottom: 36, sidePadding: 350, centerWidth: 340, gap: 60 },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 450, centerWidth: 170, logoHeight: 60 },
      showMatchChip: false
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'ultimate-marvel-vs-capcom-3': {
    id: 'ultimate-marvel-vs-capcom-3',
    label: 'Ultimate Marvel vs. Capcom 3',
    styleName: 'Footdive! [UMvC3]',
    shortLabel: 'UMVC3',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'umvc3-hyper',
      themeClass: 'theme-umvc3',
      accent: '#ffcf3d',
      background: '#101629',
      hudSafeZone: { top: 2, bottom: 36, sidePadding: 400, centerWidth: 340, gap: 30 },
      broadcastSafeZone: { bottom: 4, height: 22, railWidth: 460, centerWidth: 170, logoHeight: 60 }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'super-smash-bros-ultimate': {
    id: 'super-smash-bros-ultimate',
    label: 'Super Smash Bros. Ultimate',
    styleName: 'Everyone is Here! [SSBU]',
    shortLabel: 'SSBU',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'smash-stock',
      themeClass: 'theme-smash-ultimate',
      accent: '#ff4f5f',
      background: '#101728',
      hudSafeZone: { top: 4, bottom: 52, sidePadding: 310, centerWidth: 300, gap: 30 },
      broadcastSafeZone: {
        bottom: 0,
        height: 22,
        railWidth: 520,
        centerWidth: 240,
        logoHeight: 96,
        logoAnchor: 'upper-center',
        logoTop: 38
      }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  },
  'under-night-in-birth-ii-sys-celes': {
    id: 'under-night-in-birth-ii-sys-celes',
    label: 'Under Night In-Birth II Sys:Celes',
    styleName: 'GRD [UNI2]',
    shortLabel: 'UNI2',
    scoreMode: 'games',
    maxScore: 3,
    terminology: { set: 'Set', game: 'Game', playerOne: 'P1', playerTwo: 'P2' },
    overlay: {
      template: 'under-night-grd',
      themeClass: 'theme-under-night',
      accent: '#59d9ff',
      background: '#161329',
      hudSafeZone: { top: 3, bottom: 43, sidePadding: 300, centerWidth: 400, gap: 50 },
      broadcastSafeZone: {
        bottom: 4,
        height: 22,
        railWidth: 500,
        centerWidth: 180,
        logoHeight: 64,
        logoAnchor: 'upper-center',
        logoTop: 156
      }
    },
    editableFields: ['character', 'team', 'country', 'state', 'pronouns', 'seed', 'sponsor']
  }
};

export const defaultGameId: GameId = 'street-fighter-6';

const legacyGameIds: Record<string, GameId> = {
  'avatar-fighters': 'avatar-legends'
};

export function canonicalGameId(gameId: string | undefined): GameId | undefined {
  if (!gameId) {
    return undefined;
  }

  if (Object.hasOwn(gameProfiles, gameId)) {
    return gameId as GameId;
  }

  return legacyGameIds[gameId];
}

const startggVideogameNames: Record<string, GameId> = {
  'street fighter 6': 'street-fighter-6',
  'tekken 8': 'tekken-8',
  'avatar legends': 'avatar-legends',
  'avatar legends the fighting game': 'avatar-legends',
  'marvel tokon': 'marvel-tokon',
  'marvel tokon fighting souls': 'marvel-tokon',
  'guilty gear strive': 'guilty-gear-strive',
  '2xko': '2xko',
  'blazblue centralfiction': 'blazblue-centralfiction',
  'blazblue central fiction': 'blazblue-centralfiction',
  'fatal fury city of the wolves': 'fatal-fury-city-of-the-wolves',
  'granblue fantasy versus rising': 'granblue-fantasy-versus-rising',
  'the king of fighters xv': 'king-of-fighters-xv',
  'king of fighters xv': 'king-of-fighters-xv',
  'kof xv': 'king-of-fighters-xv',
  'melty blood type lumina': 'melty-blood-type-lumina',
  'mortal kombat 1': 'mortal-kombat-1',
  'ultimate marvel vs capcom 3': 'ultimate-marvel-vs-capcom-3',
  'ultimate marvel versus capcom 3': 'ultimate-marvel-vs-capcom-3',
  'super smash bros ultimate': 'super-smash-bros-ultimate',
  'under night in birth ii sys celes': 'under-night-in-birth-ii-sys-celes',
  'under night in birth sys celes': 'under-night-in-birth-ii-sys-celes'
};

function normalizeStartggVideogameName(name: string): string {
  return name
    .replace(/[©®™℠]/g, ' ')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[\p{Punctuation}\p{Symbol}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gameIdForStartggVideogame(
  videogame: { id: string; name: string } | undefined
): GameId | undefined {
  if (!videogame) {
    return undefined;
  }

  return startggVideogameNames[normalizeStartggVideogameName(videogame.name)];
}

export function resolveGameProfile(gameId: string | undefined): GameProfile {
  const canonicalId = canonicalGameId(gameId);
  if (canonicalId) {
    return gameProfiles[canonicalId];
  }

  return gameProfiles[defaultGameId];
}

type MatchFormatContext = {
  phase?: string;
  phaseGroup?: string;
  round?: string;
};

type MatchFormatRule = {
  bestOf: number;
  patterns: string[];
};

type MatchFormatOverride = {
  defaultBestOf?: number;
  topEightBestOf?: number;
  roundRules?: MatchFormatRule[];
};

type MatchFormatPolicies = {
  allowedBestOf: number[];
  defaultBestOf: number;
  topEightBestOf: number;
  topEightPatterns: string[];
  gameOverrides: Partial<Record<GameId, MatchFormatOverride>>;
};

const matchFormatPolicies = matchFormatPoliciesJson as MatchFormatPolicies;

function normalizeMatchFormatLabel(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function bestOfOptionsForGame(gameId: string | undefined): number[] {
  const profile = resolveGameProfile(gameId);
  return matchFormatPolicies.allowedBestOf.filter(
    (bestOf) => Math.ceil(bestOf / 2) <= profile.maxScore
  );
}

export function defaultBestOfForGame(
  gameId: string | undefined,
  context: MatchFormatContext = {}
): number {
  const profile = resolveGameProfile(gameId);
  const gameOverride = matchFormatPolicies.gameOverrides[profile.id];
  const round = normalizeMatchFormatLabel(context.round);
  const matchingRoundRule = gameOverride?.roundRules?.find((rule) =>
    rule.patterns.some((pattern) => round.includes(normalizeMatchFormatLabel(pattern)))
  );
  if (matchingRoundRule) {
    return matchingRoundRule.bestOf;
  }

  const fullContext = normalizeMatchFormatLabel(
    [context.phase, context.phaseGroup, context.round].filter(Boolean).join(' ')
  );
  const isTopEight = matchFormatPolicies.topEightPatterns.some((pattern) =>
    fullContext.includes(normalizeMatchFormatLabel(pattern))
  );
  if (isTopEight) {
    return gameOverride?.topEightBestOf ?? matchFormatPolicies.topEightBestOf;
  }

  return gameOverride?.defaultBestOf ?? matchFormatPolicies.defaultBestOf;
}

export function scoreLimitForBestOf(gameId: string | undefined, bestOf: number): number {
  const profile = resolveGameProfile(gameId);
  return Math.min(profile.maxScore, Math.max(1, Math.ceil(bestOf / 2)));
}
