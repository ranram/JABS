import { z } from 'zod';

export const customScoreboardRegionIds = [
  'playerOneFlag', 'playerOneSponsor', 'playerOneName', 'playerOnePronouns',
  'playerOneSeed', 'playerOneScore', 'playerTwoFlag', 'playerTwoSponsor',
  'playerTwoName', 'playerTwoPronouns', 'playerTwoSeed', 'playerTwoScore',
  'matchLabel', 'logo',
  'infoLeft', 'infoCenter', 'infoRight'
] as const;

export type CustomScoreboardRegionId = typeof customScoreboardRegionIds[number];

const regionSchema = z.object({
  x: z.number().int().min(0).max(1900),
  y: z.number().int().min(0).max(1060),
  width: z.number().int().min(20).max(1920),
  height: z.number().int().min(20).max(1080),
  align: z.enum(['left', 'center', 'right'])
}).superRefine((region, context) => {
  if (region.x + region.width > 1920 || region.y + region.height > 1080) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Keep this region inside the 1920×1080 canvas.'
    });
  }
});

const playerElementRegionsSchema = z.object({
  flag: regionSchema,
  sponsor: regionSchema,
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
    pronouns: z.boolean(),
    seeds: z.boolean(),
    round: z.boolean(),
    tournamentLogo: z.boolean(),
    bottomRails: z.boolean()
  }),
  typography: z.object({
    textColor: z.string().regex(/^#[0-9a-f]{6}$/i),
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

type PlayerElement = keyof CustomScoreboard['playerElements']['playerOne'];
type PlayerSide = keyof CustomScoreboard['playerElements'];

const playerRegionLocations: Partial<Record<CustomScoreboardRegionId, {
  side: PlayerSide;
  element: PlayerElement;
}>> = {
  playerOneFlag: { side: 'playerOne', element: 'flag' },
  playerOneSponsor: { side: 'playerOne', element: 'sponsor' },
  playerOneName: { side: 'playerOne', element: 'name' },
  playerOnePronouns: { side: 'playerOne', element: 'pronouns' },
  playerOneSeed: { side: 'playerOne', element: 'seed' },
  playerOneScore: { side: 'playerOne', element: 'score' },
  playerTwoFlag: { side: 'playerTwo', element: 'flag' },
  playerTwoSponsor: { side: 'playerTwo', element: 'sponsor' },
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
  if (location) return scoreboard.playerElements[location.side][location.element];
  return scoreboard.regions[id as keyof CustomScoreboard['regions']];
}

export function withCustomScoreboardRegion(
  scoreboard: CustomScoreboard,
  id: CustomScoreboardRegionId,
  region: CustomScoreboardRegion
): CustomScoreboard {
  const location = playerRegionLocations[id];
  if (!location) return {
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

export function customScoreboardRegionBounds(id: CustomScoreboardRegionId): {
  x: number; y: number; width: number; height: number;
} {
  if (id.startsWith('playerOne')) return { x: 0, y: 0, width: 960, height: 250 };
  if (id.startsWith('playerTwo')) return { x: 960, y: 0, width: 960, height: 250 };
  if (['logo', 'infoLeft', 'infoCenter', 'infoRight'].includes(id)) {
    return { x: 0, y: 780, width: 1920, height: 300 };
  }
  return { x: 0, y: 0, width: 1920, height: 1080 };
}
