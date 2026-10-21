import type { PlayerState } from '@shared/models';
import type { LibraryIdentity, LibraryPlayer, PlayerGamePreferences } from '@shared/playerLibrary';
import { playerCharacters } from '@shared/characterTeams';

const profileFields = ['country', 'state', 'displayFlag', 'pronouns', 'xHandle'] as const;
export type StreamPlayerDefaults = {
  identity: LibraryIdentity;
  name: string;
  gameKey: string;
  overrides: Partial<Record<(typeof profileFields)[number], string>>;
  games: Record<string, Partial<PlayerGamePreferences>>;
};

/** Save reusable player preferences while leaving match details, names and sponsors in stream state. */
export function streamPlayerDefaults(
  before: PlayerState,
  after: PlayerState,
  gameKey: string
): StreamPlayerDefaults | undefined {
  if (
    (!before.localPlayerId && !before.playerId) ||
    before.localPlayerId !== after.localPlayerId ||
    before.playerId !== after.playerId ||
    before.entrantId !== after.entrantId
  )
    return undefined;
  const overrides: StreamPlayerDefaults['overrides'] = {};
  for (const field of profileFields) {
    if ((before[field] ?? '') !== (after[field] ?? '')) overrides[field] = after[field] ?? '';
  }
  if (Object.hasOwn(overrides, 'country')) overrides.state = after.state ?? '';
  const previous = playerCharacters(before);
  const characters = playerCharacters(after);
  const game: Partial<PlayerGamePreferences> = {};
  if (JSON.stringify(previous) !== JSON.stringify(characters)) game.characters = characters;
  for (const field of ['characterAssetId', 'portraitAssetId'] as const) {
    if ((before[field] ?? null) !== (after[field] ?? null)) game[field] = after[field] ?? null;
  }
  if (previous[0] !== characters[0]) {
    game.characterAssetId = after.characterAssetId ?? null;
    game.portraitAssetId = null;
  }
  if (!Object.keys(overrides).length && !Object.keys(game).length) return undefined;
  return {
    identity: { localPlayerId: before.localPlayerId, playerId: before.playerId },
    name: before.name,
    gameKey,
    overrides,
    games: Object.keys(game).length ? { [gameKey]: game } : {}
  };
}

export function mergeStreamPlayerDefaults(
  older: StreamPlayerDefaults,
  newer: StreamPlayerDefaults
): StreamPlayerDefaults {
  const games = { ...older.games };
  for (const [key, patch] of Object.entries(newer.games)) games[key] = { ...games[key], ...patch };
  return { ...newer, overrides: { ...older.overrides, ...newer.overrides }, games };
}

export function applyStreamPlayerDefaults(player: LibraryPlayer, edits: StreamPlayerDefaults): LibraryPlayer {
  const games = [...player.games];
  for (const [gameKey, patch] of Object.entries(edits.games)) {
    const index = games.findIndex((game) => game.gameKey === gameKey);
    const current = games[index] ?? { gameKey, characters: [], characterAssetId: null, portraitAssetId: null };
    const next = { ...current, ...patch, gameKey };
    if (index < 0) games.push(next);
    else games[index] = next;
  }
  return { ...player, overrides: { ...player.overrides, ...edits.overrides }, games };
}
