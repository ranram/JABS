import type { GameCharacterAsset } from '@shared/models';
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
  return Promise.all(
    selected.map(async ({ character, portraitAssetId }) => ({
      character,
      url: await api.gameCharacterPortraitUrl(gameId, portraitAssetId)
    }))
  );
}
