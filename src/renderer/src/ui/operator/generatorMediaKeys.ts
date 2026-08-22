import { playerCharacters } from '@shared/characterTeams';

type GeneratorSubject = {
  name: string;
  sponsor?: string;
  character?: string;
  characters?: string[];
};

export function generatorIdentityKey(
  subjects: readonly GeneratorSubject[],
  context: { tournamentName?: string; headline?: string }
): string {
  return JSON.stringify({
    identities: subjects.map(({ name, sponsor }) => ({ name, sponsor })),
    context
  });
}

export function generatorCharacterKey(subjects: readonly GeneratorSubject[]): string {
  return subjects.map((subject) => playerCharacters(subject).join('\u0001')).join('\u0000');
}
