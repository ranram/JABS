import { z } from 'zod';
import { scoreboardPhotoSchema } from './scoreboardPhotos';

const text = z.string().max(200);
export const playerProfileSchema = z
  .object({
    name: text,
    prefix: text.nullable(),
    xHandle: text.nullable(),
    pronouns: text.nullable(),
    country: text.nullable(),
    state: text.nullable(),
    profileSlug: text.nullable()
  })
  .strict();
export const playerGamePreferencesSchema = z
  .object({
    gameKey: z.string().min(1).max(150),
    characters: z.array(text).max(4),
    characterAssetId: z.string().max(300).nullable(),
    portraitAssetId: z.string().max(300).nullable()
  })
  .strict();
export const libraryPlayerSchema = z
  .object({
    localId: z.string().regex(/^[a-f0-9]{32}$/),
    playerId: z.string().regex(/^\d+$/).nullable(),
    imported: playerProfileSchema,
    overrides: z.record(z.string(), text),
    scoreboardPhoto: scoreboardPhotoSchema.nullable().optional(),
    aliases: z.array(text),
    games: z.array(playerGamePreferencesSchema),
    updatedAt: z.string(),
    seenAt: z.string()
  })
  .strict();
export type LibraryPlayer = z.infer<typeof libraryPlayerSchema>;
export const librarySaveWarningSchema = z
  .object({
    field: z.enum([
      'name',
      'prefix',
      'xHandle',
      'pronouns',
      'country',
      'state',
      'displayFlag',
      'playerPhotoAssetId',
      'nickname',
      'aliases',
      'characters'
    ]),
    reason: z.literal('blocked-text')
  })
  .strict();
export const librarySaveSchema = z
  .object({
    player: libraryPlayerSchema,
    warnings: z.array(librarySaveWarningSchema)
  })
  .strict();
export type PlayerGamePreferences = z.infer<typeof playerGamePreferencesSchema>;
export const librarySearchSchema = z.object({
  players: z.array(libraryPlayerSchema),
  total: z.number().int().nonnegative()
});
export const playerImportPageSchema = z.object({ page: z.number(), totalPages: z.number(), added: z.number() });
export const libraryPresentationSchema = z.object({
  age: z.number().int().min(1).max(120).nullable().optional(),
  nickname: text.nullable().optional(),
  overriddenFields: z.array(z.string()).default([]),
  localPlayerId: z.string(),
  playerId: z.string().nullable(),
  name: text,
  prefix: text.nullable(),
  sponsor: text.nullable(),
  xHandle: text.nullable(),
  pronouns: text.nullable(),
  country: text.nullable(),
  state: text.nullable(),
  displayFlag: text.nullable(),
  playerPhotoAssetId: text.nullable(),
  characters: z.array(text).optional(),
  character: text.nullable().optional(),
  characterAssetId: text.nullable().optional(),
  portraitAssetId: text.nullable().optional()
});
export const libraryResolveSchema = z.array(libraryPresentationSchema.nullable());
export type LibraryIdentity = { localPlayerId?: string; playerId?: string };
export function playerLabel(player: LibraryPlayer): string {
  return player.overrides.name || player.imported.name;
}
export function presentationFields(value: z.infer<typeof libraryPresentationSchema>) {
  return {
    localPlayerId: value.localPlayerId,
    playerId: value.playerId ?? undefined,
    name: value.name,
    prefix: value.prefix ?? undefined,
    sponsor: value.sponsor ?? undefined,
    xHandle: value.xHandle ?? undefined,
    pronouns: value.pronouns ?? undefined,
    country: value.country ?? undefined,
    state: value.state ?? undefined,
    displayFlag: value.displayFlag ?? undefined,
    playerPhotoAssetId: value.playerPhotoAssetId ?? undefined,
    characters: value.characters,
    character: value.character ?? undefined,
    characterAssetId: value.characterAssetId ?? undefined,
    portraitAssetId: value.portraitAssetId ?? undefined
  };
}

export const libraryImportSchema = z.object({
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative()
});

export const libraryLookupSchema = z.object({ player: libraryPlayerSchema, source: z.enum(['local', 'startgg']) });
