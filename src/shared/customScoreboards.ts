import { z } from 'zod';
import { bundledFontIds, bundledFontSchema, type BundledFontId } from './fonts';

export const customScoreboardFontIds = bundledFontIds;
export type CustomScoreboardFontId = BundledFontId;
export const defaultCustomScoreboardFont: CustomScoreboardFontId = 'bebas-neue';

export const customScoreboardRegionIds = [
  'playerOneFlag',
  'playerOneXHandle',
  'playerOneName',
  'playerOnePronouns',
  'playerOneSeed',
  'playerOneScore',
  'playerTwoFlag',
  'playerTwoXHandle',
  'playerTwoName',
  'playerTwoPronouns',
  'playerTwoSeed',
  'playerTwoScore',
  'matchLabel',
  'logo',
  'infoLeft',
  'infoCenter',
  'infoRight'
] as const;

export type CustomScoreboardRegionId = (typeof customScoreboardRegionIds)[number];

const regionSchema = z
  .object({
    x: z.number().int().min(0).max(1900),
    y: z.number().int().min(0).max(1060),
    width: z.number().int().min(20).max(1920),
    height: z.number().int().min(20).max(1080),
    align: z.enum(['left', 'center', 'right'])
  })
  .superRefine((region, context) => {
    if (region.x + region.width > 1920 || region.y + region.height > 1080) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Keep this region inside the 1920×1080 canvas.'
      });
    }
  });

const playerElementRegionsSchema = z.object({
  flag: regionSchema,
  // Preserve older layout files; the name region now owns sponsor text too.
  sponsor: regionSchema,
  xHandle: regionSchema.optional(),
  name: regionSchema,
  pronouns: regionSchema,
  seed: regionSchema,
  score: regionSchema
});

export const customScoreboardSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().trim().min(1).max(60),
  frameRevision: z.string().min(1).max(64),
  regions: z.object({
    // Retained so layouts imported before independent player regions remain readable.
    playerOne: regionSchema,
    playerTwo: regionSchema,
    matchLabel: regionSchema,
    logo: regionSchema,
    infoLeft: regionSchema,
    infoCenter: regionSchema,
    infoRight: regionSchema
  }),
  playerElements: z.object({
    playerOne: playerElementRegionsSchema,
    playerTwo: playerElementRegionsSchema
  }),
  visibility: z.object({
    flags: z.boolean(),
    sponsors: z.boolean(),
    xHandles: z.boolean(),
    pronouns: z.boolean(),
    seeds: z.boolean(),
    round: z.boolean(),
    tournamentLogo: z.boolean(),
    bottomRails: z.boolean(),
    infoLeft: z.boolean().default(true),
    infoCenter: z.boolean().default(true),
    infoRight: z.boolean().default(true)
  }),
  typography: z.object({
    font: bundledFontSchema.optional(),
    textColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    sponsorColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    outline: z.enum(['none', 'soft', 'strong']),
    nameSize: z.number().int().min(12).max(96),
    metaSize: z.number().int().min(10).max(64),
    scoreSize: z.number().int().min(16).max(120),
    contextSize: z.number().int().min(10).max(64)
  })
});

export const customScoreboardListSchema = z.object({
  scoreboards: z.array(customScoreboardSchema)
});

export type CustomScoreboard = z.infer<typeof customScoreboardSchema>;
export type CustomScoreboardRegion = z.infer<typeof regionSchema>;

type PlayerElement = keyof NonNullable<CustomScoreboard['playerElements']['playerOne']>;
type PlayerSide = keyof CustomScoreboard['playerElements'];

const defaultPlayerOneXHandle: CustomScoreboardRegion = { x: 116, y: 76, width: 520, height: 22, align: 'left' };
const defaultPlayerTwoXHandle: CustomScoreboardRegion = { x: 1284, y: 76, width: 520, height: 22, align: 'right' };

function defaultPlayerElementRegion(side: PlayerSide, element: PlayerElement): CustomScoreboardRegion {
  if (element === 'xHandle') {
    return side === 'playerOne' ? defaultPlayerOneXHandle : defaultPlayerTwoXHandle;
  }
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    align: side === 'playerOne' ? 'left' : 'right'
  };
}

const playerRegionLocations: Partial<
  Record<
    CustomScoreboardRegionId,
    {
      side: PlayerSide;
      element: PlayerElement;
    }
  >
> = {
  playerOneFlag: { side: 'playerOne', element: 'flag' },
  playerOneXHandle: { side: 'playerOne', element: 'xHandle' },
  playerOneName: { side: 'playerOne', element: 'name' },
  playerOnePronouns: { side: 'playerOne', element: 'pronouns' },
  playerOneSeed: { side: 'playerOne', element: 'seed' },
  playerOneScore: { side: 'playerOne', element: 'score' },
  playerTwoFlag: { side: 'playerTwo', element: 'flag' },
  playerTwoXHandle: { side: 'playerTwo', element: 'xHandle' },
  playerTwoName: { side: 'playerTwo', element: 'name' },
  playerTwoPronouns: { side: 'playerTwo', element: 'pronouns' },
  playerTwoSeed: { side: 'playerTwo', element: 'seed' },
  playerTwoScore: { side: 'playerTwo', element: 'score' }
};

export function customScoreboardRegion(
  scoreboard: CustomScoreboard,
  id: CustomScoreboardRegionId
): CustomScoreboardRegion {
  const location = playerRegionLocations[id];
  if (location) {
    const side = scoreboard.playerElements[location.side];
    const region = side[location.element];
    return region ?? defaultPlayerElementRegion(location.side, location.element);
  }
  return scoreboard.regions[id as keyof CustomScoreboard['regions']];
}

export function withCustomScoreboardRegion(
  scoreboard: CustomScoreboard,
  id: CustomScoreboardRegionId,
  region: CustomScoreboardRegion
): CustomScoreboard {
  const location = playerRegionLocations[id];
  if (!location)
    return {
      ...scoreboard,
      regions: { ...scoreboard.regions, [id]: region }
    };
  return {
    ...scoreboard,
    playerElements: {
      ...scoreboard.playerElements,
      [location.side]: {
        ...scoreboard.playerElements[location.side],
        [location.element]: region
      }
    }
  };
}

export function oppositeCustomScoreboardRegionId(id: CustomScoreboardRegionId): CustomScoreboardRegionId | undefined {
  const source = playerRegionLocations[id];
  if (!source) return undefined;
  return customScoreboardRegionIds.find((candidate) => {
    const target = playerRegionLocations[candidate];
    return target && target.side !== source.side && target.element === source.element;
  });
}

export function mirrorCustomScoreboardRegion(
  scoreboard: CustomScoreboard,
  id: CustomScoreboardRegionId
): CustomScoreboard {
  const target = oppositeCustomScoreboardRegionId(id);
  if (!target) return scoreboard;
  const source = clampCustomScoreboardRegion(id, customScoreboardRegion(scoreboard, id));
  return withCustomScoreboardRegion(scoreboard, target, {
    ...source,
    x: 1920 - source.x - source.width,
    align: source.align === 'left' ? 'right' : source.align === 'right' ? 'left' : 'center'
  });
}

export function customScoreboardRegionBounds(id: CustomScoreboardRegionId): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (id.startsWith('playerOne')) return { x: 0, y: 0, width: 960, height: 250 };
  if (id.startsWith('playerTwo')) return { x: 960, y: 0, width: 960, height: 250 };
  if (['logo', 'infoLeft', 'infoCenter', 'infoRight'].includes(id)) {
    return { x: 0, y: 780, width: 1920, height: 300 };
  }
  return { x: 0, y: 0, width: 1920, height: 1080 };
}

export function clampCustomScoreboardRegion(
  id: CustomScoreboardRegionId,
  region: CustomScoreboardRegion
): CustomScoreboardRegion {
  const bounds = customScoreboardRegionBounds(id);
  const width = Math.max(20, Math.min(bounds.width, region.width));
  const height = Math.max(20, Math.min(bounds.height, region.height));
  return {
    ...region,
    width,
    height,
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, region.x)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, region.y))
  };
}
