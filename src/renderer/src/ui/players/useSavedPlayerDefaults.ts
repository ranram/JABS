import { useEffect, useRef } from 'react';
import { presentationFields, type LibraryIdentity } from '@shared/playerLibrary';
import { playerCharacters } from '@shared/characterTeams';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
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

/** Refresh saved preferences while preserving manual changes in a graphic. */
export function useSavedPlayerDefaults<T extends Subject>(
  subjects: T[],
  gameKey: string,
  apply: (original: T[], saved: SavedDefaults[]) => void,
  sourceKey?: string
) {
  const revision = useCatalogRevision();
  const previous = useRef<{ key: string; originals: T[]; applied: T[] } | undefined>(undefined);
  const callback = useRef(apply);
  callback.current = apply;
  const key = JSON.stringify([
    gameKey,
    sourceKey,
    subjects.map(({ localPlayerId, playerId }) => ({ localPlayerId, playerId }))
  ]);
  const identityKey = JSON.stringify([
    gameKey,
    sourceKey,
    subjects.map(({ localPlayerId, playerId }) => (playerId ? { playerId } : { localPlayerId }))
  ]);
  useEffect(() => {
    let active = true;
    if (!subjects.some((subject) => subject.localPlayerId || subject.playerId)) return;
    const last =
      previous.current?.key === identityKey &&
      subjects.every((subject, index) => subject.localPlayerId === previous.current?.applied[index]?.localPlayerId)
        ? previous.current
        : undefined;
    const originals = last?.originals ?? subjects;
    const baseline = last?.applied ?? subjects;
    void api
      .resolvePlayers(
        subjects.map(({ localPlayerId, playerId }) => ({ localPlayerId, playerId })),
        gameKey
      )
      .then((players) => {
        if (!active) return;
        const patches = originals.map((original, index) => {
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
          if (last && characters.length && characters[0] !== savedCharacter) {
            artwork = { characterAssetId: original.characterAssetId, portraitAssetId: original.portraitAssetId };
          }
          const profile: SavedDefaults = {};
          for (const field of reusableProfileFields) {
            profile[field] = player.overriddenFields.includes(field) ? saved[field] : (original[field] ?? saved[field]);
          }
          return {
            ...profile,
            localPlayerId: saved.localPlayerId,
            ...artwork,
            ...(!original.playerPhotoAssetId ? { playerPhotoAssetId: saved.playerPhotoAssetId } : {})
          };
        });
        const sources = last
          ? originals
          : originals.map((original, index) => {
              const player = players[index];
              if (!player) return original;
              const saved = presentationFields(player);
              const source = { ...original };
              for (const field of [
                ...reusableProfileFields,
                'playerPhotoAssetId',
                'characterAssetId',
                'portraitAssetId'
              ] as const) {
                if (Object.is(original[field], saved[field])) Object.assign(source, { [field]: undefined });
              }
              return source;
            });
        previous.current = {
          key: identityKey,
          originals: sources,
          applied: baseline.map((original, index) => ({ ...original, ...patches[index] }))
        };
        callback.current(baseline, patches);
      })
      .catch(() => {
        /* Saved preferences are optional; the current graphic remains editable. */
      });
    return () => {
      active = false;
    };
  }, [key, revision]);
}
