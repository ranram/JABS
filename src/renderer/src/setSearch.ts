import type { SetSummary } from '@shared/models';

function normalizeSearchText(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterLoadedSets(sets: SetSummary[], search: string): SetSummary[] {
  const terms = normalizeSearchText(search).split(' ').filter(Boolean);
  if (terms.length === 0) {
    return sets;
  }

  return sets.filter((set) => {
    const searchable = normalizeSearchText([
      set.id,
      set.phase,
      set.phaseGroup,
      set.round,
      set.station,
      set.displayScore,
      set.entrantOne?.name,
      set.entrantTwo?.name
    ].filter(Boolean).join(' '));
    return terms.every((term) => searchable.includes(term));
  });
}
