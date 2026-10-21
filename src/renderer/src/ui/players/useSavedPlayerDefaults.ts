import { useEffect, useRef } from 'react';
import { presentationFields, type LibraryIdentity } from '@shared/playerLibrary';
import { playerCharacters } from '@shared/characterTeams';
import { api } from '../../api';

type Subject = LibraryIdentity & {
  xHandle?: string;
  pronouns?: string;
  country?: string;
  state?: string;
  displayFlag?: string;
  name: string;
  character?: string;
  characters?: string[];
  characterAssetId?: string;
  playerPhotoAssetId?: string;
  portraitAssetId?: string;
};
type SavedDefaults = Partial<Omit<Subject, 'name' | 'playerId'>>;
const reusableProfileFields = ['xHandle', 'pronouns', 'country', 'state', 'displayFlag'] as const;
const characterFields = ['character', 'characters', 'characterAssetId', 'portraitAssetId'] as const;

/** Fill fields the user has not edited; keep each character paired with its outfit. */
export function mergeSavedPlayerDefaults<T extends Subject>(current: T, original?: T, saved?: SavedDefaults): T {
  if (
    !original ||
    !saved ||
    current.localPlayerId !== original.localPlayerId ||
    current.playerId !== original.playerId ||
    current.name !== original.name
  )
    return current;
  const characterEdited = characterFields.some((field) => !Object.is(current[field], original[field]));
  const patch: SavedDefaults = {};
  for (const field of Object.keys(saved) as Array<keyof SavedDefaults>) {
    if (characterEdited && (characterFields as readonly string[]).includes(field)) continue;
    if (Object.is(current[field], original[field])) Object.assign(patch, { [field]: saved[field] });
  }
  return { ...current, ...patch };
}

/** Reload preferences when the player, game or source changes, preserving manual edits made while waiting. */
export function useSavedPlayerDefaults<T extends Subject>(
  subjects: T[],
  gameKey: string,
  apply: (original: T[], saved: SavedDefaults[]) => void,
  sourceKey?: string
) {
  const callback = useRef(apply);
  callback.current = apply;
  const key = JSON.stringify([
    gameKey,
    sourceKey,
    subjects.map(({ localPlayerId, playerId }) => ({ localPlayerId, playerId }))
  ]);
  useEffect(() => {
    let active = true;
    if (!subjects.some((subject) => subject.localPlayerId || subject.playerId)) return;
    void api
      .resolvePlayers(
        subjects.map(({ localPlayerId, playerId }) => ({ localPlayerId, playerId })),
        gameKey
      )
      .then((players) => {
        if (!active) return;
        callback.current(
          subjects,
          subjects.map((original, index) => {
            const player = players[index];
            if (!player) return {};
            const saved = presentationFields(player);
            const characters = playerCharacters(original);
            const savedCharacter = playerCharacters(saved)[0];
            let artwork: SavedDefaults = {};
            if (!characters.length) {
              artwork = {
                characters: saved.characters,
                character: saved.character,
                characterAssetId: saved.characterAssetId,
                portraitAssetId: saved.portraitAssetId
              };
            } else if (characters[0] === savedCharacter) {
              // An imported character can still use its saved outfit without replacing a manual choice.
              artwork = {
                characterAssetId: original.characterAssetId ?? saved.characterAssetId,
                portraitAssetId: original.portraitAssetId ?? saved.portraitAssetId
              };
            }
            const profile: SavedDefaults = {};
            for (const field of reusableProfileFields) {
              profile[field] = player.overriddenFields.includes(field)
                ? saved[field]
                : (original[field] ?? saved[field]);
            }
            return {
              ...profile,
              localPlayerId: saved.localPlayerId,
              ...artwork,
              ...(!original.playerPhotoAssetId ? { playerPhotoAssetId: saved.playerPhotoAssetId } : {})
            };
          })
        );
      })
      .catch(() => {
        /* Saved preferences are optional; the current graphic remains editable. */
      });
    return () => {
      active = false;
    };
  }, [key]);
}
