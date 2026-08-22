import type { GameCharacterAsset } from '@shared/models';
import { useEffect, useState } from 'react';
import { api } from './api';

export type CharacterPortrait = {
  character: string;
  url: string;
};

/** Loads only explicitly supplied, compact portraits for the selected team. */
export async function loadCharacterPortraits(
  gameId: string,
  characters: readonly string[],
  assets: readonly GameCharacterAsset[]
): Promise<CharacterPortrait[]> {
  const byCharacter = new Map(assets.map((asset) => [asset.character, asset]));
  const selected = [...new Set(characters)].flatMap((character) => {
    const portraitAssetId = byCharacter.get(character)?.portraitAssetId;
    return portraitAssetId ? [{ character, portraitAssetId }] : [];
  });
  return Promise.all(selected.map(async ({ character, portraitAssetId }) => ({
    character,
    url: await api.gameCharacterPortraitUrl(gameId, portraitAssetId)
  })));
}

export function useCharacterPortraits(gameId: string, characters: readonly string[]): CharacterPortrait[] {
  const [portraits, setPortraits] = useState<CharacterPortrait[]>([]);
  const characterKey = characters.join('\u0000');
  useEffect(() => {
    let active = true;
    const selectedCharacters = characterKey ? characterKey.split('\u0000') : [];
    setPortraits([]);
    if (selectedCharacters.length === 0) {
      return () => { active = false; };
    }
    void api.gameCharacterAssets(gameId)
      .then(({ assets }) => loadCharacterPortraits(gameId, selectedCharacters, assets))
      .then((next) => { if (active) setPortraits(next); })
      .catch(() => { if (active) setPortraits([]); });
    return () => { active = false; };
  }, [characterKey, gameId]);
  return portraits;
}
