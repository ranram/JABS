import type { SetSummary } from './models';
import { detectTopEightOpeningSets } from './topEightMatchups';

/** Follow advancement links, independent of translated round labels. */
export function topEightQueueSets(sets: readonly SetSummary[]): SetSummary[] | undefined {
  const opening = detectTopEightOpeningSets(sets);
  if (!opening) return undefined;
  const [winnersSemifinals, losersRoundOne] = [opening.slice(0, 2), opening.slice(2)];
  const follows = (set: SetSummary, source: SetSummary, placement: 1 | 2) =>
    set.prerequisites?.some((p) => p.setId === source.id && p.placement === placement);
  const unique = (candidates: SetSummary[]) => (candidates.length === 1 ? candidates[0] : undefined);
  const winnersFinal = unique(sets.filter((set) => winnersSemifinals.every((source) => follows(set, source, 1))));
  const quarters = losersRoundOne.map((source) =>
    unique(sets.filter((set) => follows(set, source, 1) && winnersSemifinals.some((winner) => follows(set, winner, 2))))
  );
  const losersQuarters = quarters.filter((set): set is SetSummary => set !== undefined);
  if (!winnersFinal || losersQuarters.length !== 2) return undefined;
  const losersSemi = unique(sets.filter((set) => losersQuarters.every((source) => follows(set, source, 1))));
  if (!losersSemi) return undefined;
  const losersFinal = unique(sets.filter((set) => follows(set, winnersFinal, 2) && follows(set, losersSemi, 1)));
  if (!losersFinal) return undefined;
  const finals = sets
    .filter((set) => follows(set, winnersFinal, 1) && follows(set, losersFinal, 1))
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));
  // Some brackets expose the reset with the same prerequisites as Grand Finals.
  const [firstFinal, secondFinal] = finals;
  const grandFinal =
    finals.length === 1 || (finals.length === 2 && firstFinal?.roundNumber !== secondFinal?.roundNumber)
      ? firstFinal
      : undefined;
  if (!grandFinal) return undefined;
  const reset = sets.filter(
    (set) =>
      set.id !== grandFinal.id &&
      (finals.includes(set) ||
        set.prerequisites?.some((p) => p.setId === grandFinal.id) ||
        (grandFinal.phaseGroupId !== undefined &&
          set.phaseGroupId === grandFinal.phaseGroupId &&
          grandFinal.roundNumber !== undefined &&
          (set.roundNumber ?? 0) > grandFinal.roundNumber))
  );
  if (reset.length > 1) return undefined;
  const ordered = [
    ...winnersSemifinals,
    ...losersRoundOne,
    ...losersQuarters,
    winnersFinal,
    losersSemi,
    losersFinal,
    grandFinal,
    ...reset
  ];
  return new Set(ordered.map((set) => set.id)).size === ordered.length ? ordered : undefined;
}
