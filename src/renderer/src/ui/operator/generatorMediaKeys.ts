import { playerCharacters } from '@shared/characterTeams';

export type GeneratorSubject = {
  name: string;
  playerPhotoAssetId?: string;
  sponsor?: string;
  character?: string;
  characters?: string[];
  characterAssetId?: string;
};

export function generatorIdentityKey(
  subjects: readonly GeneratorSubject[],
  context: { tournamentName?: string; headline?: string }
): string {
  return JSON.stringify({
    identities: subjects.map(({ name, sponsor, playerPhotoAssetId }) => ({ name, sponsor, playerPhotoAssetId })),
    context
  });
}

export function generatorCharacterKey(subjects: readonly GeneratorSubject[]): string {
  return JSON.stringify(
    subjects.map((subject) => ({
      characters: playerCharacters(subject),
      characterAssetId: subject.characterAssetId
    }))
  );
}
