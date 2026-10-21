import policies from './characterTeamPolicies.json';

const teamPolicies: Record<string, number> = policies;

/** Maximum roster slots used by the game's standard competitive format. */
export function maxCharactersForGame(gameId?: string): number {
  return gameId && Object.hasOwn(teamPolicies, gameId) ? teamPolicies[gameId] ?? 1 : 1;
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
export function characterTeamSelection(
  characters: string[],
  current?: { character?: string; characterAssetId?: string; portraitAssetId?: string }
): {
  character?: string;
  characters?: string[];
  characterAssetId?: string;
  portraitAssetId?: string;
} {
  const character = characters[0];
  return {
    character,
    characters: characters.length ? characters : undefined,
    characterAssetId: character && character === current?.character
      ? current.characterAssetId
      : undefined,
    portraitAssetId: character && character === current?.character
      ? current.portraitAssetId
      : undefined
  };
}
