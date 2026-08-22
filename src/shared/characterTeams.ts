import policies from './characterTeamPolicies.json';
import type { GameId } from './gameProfiles';

const teamPolicies = policies as Record<GameId, number>;

/** Maximum roster slots used by the game's standard competitive format. */
export function maxCharactersForGame(gameId?: GameId): number {
  return gameId ? teamPolicies[gameId] ?? 1 : 1;
}

export function playerCharacters(player: { character?: string; characters?: string[] }): string[] {
  if (player.characters?.length) return player.characters;
  return player.character ? [player.character] : [];
}

/** Portrait strips supplement the lead character artwork instead of repeating it. */
export function playerPortraitCharacters(player: {
  character?: string;
  characters?: string[];
}): string[] {
  return playerCharacters(player).slice(1);
}

/** Keeps the legacy lead slot synchronized with the ordered team array. */
export function characterTeamSelection(characters: string[]): {
  character?: string;
  characters?: string[];
} {
  return {
    character: characters[0],
    characters: characters.length ? characters : undefined
  };
}
