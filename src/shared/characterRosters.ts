import { canonicalGameId, type GameId } from './gameProfiles';
import { generatedCharacterRosters } from './generatedCharacterRosters';

export function charactersForGame(gameId: GameId): readonly string[] {
  return generatedCharacterRosters[gameId];
}

export function isCharacterForGame(gameId: GameId, character: string): boolean {
  return charactersForGame(gameId).includes(character as never);
}

export function charactersForAssetCatalog(assetCatalogSlug: string): readonly string[] {
  const gameId = canonicalGameId(assetCatalogSlug);
  return gameId ? charactersForGame(gameId) : [];
}

function normalizeCharacterName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[\p{Punctuation}\p{Symbol}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a raw character name from start.gg (or another external source) against
 * the reviewed JABS roster for a supported game. Returns the canonical roster
 * name with original casing when a normalized match is found; otherwise returns
 * undefined so unmatched strings cannot be injected into the roster.
 */
export function matchCharacterName(gameId: GameId, rawName: string | undefined): string | undefined {
  if (!rawName) return undefined;
  const needle = normalizeCharacterName(rawName);
  if (!needle) return undefined;
  const roster = charactersForGame(gameId);
  return roster.find((candidate) => normalizeCharacterName(candidate) === needle);
}
