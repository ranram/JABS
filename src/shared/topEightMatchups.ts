import { z } from 'zod';
import { canonicalGameId, type GameId } from './gameProfiles';
import type { SetSummary } from './models';

const playerSchema = z.object({
  entrantId: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  sponsor: z.string().trim().max(100).optional(),
  character: z.string().trim().min(1).max(100).optional(),
  characterAssetId: z.string().trim().min(1).max(255).optional()
});

const matchupSchema = z.object({
  setId: z.string().optional(),
  bracket: z.enum(['winners', 'losers']),
  players: z.tuple([playerSchema, playerSchema])
});

export const topEightMatchupsStateSchema = z.object({
  stylingGameId: z.custom<GameId>((value) => typeof value === 'string' && canonicalGameId(value) === value),
  showBackground: z.boolean().default(true),
  showTournamentLogo: z.boolean().default(true),
  flipPlayerTwoPortraits: z.boolean().default(false),
  assetCatalogSlug: z.string().trim().min(1).max(100),
  tournamentName: z.string().trim().min(1).max(120),
  eventName: z.string().trim().max(120).optional(),
  logoAssetId: z.string().trim().min(1).max(255).optional(),
  matchups: z.array(matchupSchema).length(4).refine(
    (matchups) => matchups.every((matchup, index) => matchup.bracket === (index < 2 ? 'winners' : 'losers')),
    'Top 8 requires two winners matchups followed by two losers matchups.'
  ),
  updatedAt: z.string().datetime({ offset: true })
});

export type TopEightMatchupsState = z.infer<typeof topEightMatchupsStateSchema>;

export function parseTopEightMatchupsRealtime(value: unknown): TopEightMatchupsState | undefined {
  const message = z.object({
    event: z.literal('top-eight-matchups-state'),
    payload: topEightMatchupsStateSchema
  }).safeParse(value);
  return message.success ? message.data.payload : undefined;
}

/** Finds the four sets where eight entrants enter the final double-elimination subtree. */
export function detectTopEightOpeningSets(sets: readonly SetSummary[]): SetSummary[] | undefined {
  const byId = new Map(sets.map((set) => [set.id, set]));
  const referenced = new Set(sets.flatMap((set) => set.prerequisites?.map(({ setId }) => setId) ?? []));
  const candidates = sets.filter((set) =>
    (set.prerequisites?.length ?? 0) === 2
    && !referenced.has(set.id)
  );

  const detected: SetSummary[][] = [];
  for (const grandFinal of candidates) {
    const finalPrerequisites = prerequisiteSets(grandFinal, byId);
    if (finalPrerequisites.length !== 2) continue;
    const winnersFinal = finalPrerequisites.find((candidate) => finalPrerequisites.some((other) =>
      other.id !== candidate.id
      && other.prerequisites?.some(({ setId, placement }) => setId === candidate.id && placement === 2)
    ));
    const losersFinal = finalPrerequisites.find((candidate) => candidate.id !== winnersFinal?.id);
    if (!winnersFinal || !losersFinal) continue;
    const winnersSemifinals = prerequisiteSets(winnersFinal, byId)
      .filter((set) => prerequisitePlacement(winnersFinal, set.id) === 1);
    const losersSemifinal = prerequisiteSets(losersFinal, byId).find((set) => set.id !== winnersFinal.id);
    if (winnersSemifinals.length !== 2 || !losersSemifinal) continue;
    const losersQuarterfinals = prerequisiteSets(losersSemifinal, byId)
      .filter((set) => prerequisitePlacement(losersSemifinal, set.id) === 1);
    if (losersQuarterfinals.length !== 2) continue;
    const winnersIds = new Set(winnersSemifinals.map(({ id }) => id));
    const losersOpening = losersQuarterfinals.map((quarterfinal) => prerequisiteSets(quarterfinal, byId).find((set) =>
      !winnersIds.has(set.id) && prerequisitePlacement(quarterfinal, set.id) === 1
    ));
    if (losersOpening.some((set) => !set)) continue;
    const opening = [...winnersSemifinals, ...losersOpening] as SetSummary[];
    const entrants = new Set(opening.flatMap((set) => [set.entrantOne?.id, set.entrantTwo?.id].filter(Boolean)));
    if (entrants.size === 8) detected.push(opening);
  }
  if (detected.length === 0) return undefined;
  const latestPhaseOrder = Math.max(...detected.map((opening) => opening[0]?.phaseOrder ?? -1));
  const latest = detected.filter((opening) => (opening[0]?.phaseOrder ?? -1) === latestPhaseOrder);
  return latest.length === 1 ? latest[0] : undefined;
}

/** Uses bracket coordinates after an explicitly named Top 8 phase establishes the scope. */
export function detectExplicitTopEightOpeningSets(sets: readonly SetSummary[]): SetSummary[] | undefined {
  const complete = sets.filter((set) => set.entrantOne && set.entrantTwo);
  const winnersGroups = roundGroups(complete, (round) => round > 0)
    .filter((group) => group.length === 2)
    .sort((a, b) => a[0]!.roundNumber! - b[0]!.roundNumber!);
  const losersGroups = roundGroups(complete, (round) => round < 0)
    .filter((group) => group.length === 2);

  // Some start.gg bracket configurations number losers rounds in opposite
  // directions. Within an explicitly named Top 8 phase, the correct opening
  // pair is the combination that introduces eight distinct entrants.
  for (const winners of winnersGroups) {
    for (const losers of losersGroups) {
      const opening = [...winners, ...losers];
      const entrants = new Set(opening.flatMap((set) => [set.entrantOne!.id, set.entrantTwo!.id]));
      if (entrants.size === 8) return opening;
    }
  }
  return detectTopEightOpeningSets(sets);
}

function roundGroups(sets: readonly SetSummary[], accepts: (round: number) => boolean): SetSummary[][] {
  const groups = new Map<number, SetSummary[]>();
  for (const set of sets) {
    if (set.roundNumber === undefined || !accepts(set.roundNumber)) continue;
    const group = groups.get(set.roundNumber) ?? [];
    group.push(set);
    groups.set(set.roundNumber, group);
  }
  return [...groups.values()];
}

function prerequisiteSets(set: SetSummary, byId: ReadonlyMap<string, SetSummary>): SetSummary[] {
  return (set.prerequisites ?? []).flatMap(({ setId }) => {
    const prerequisite = byId.get(setId);
    return prerequisite ? [prerequisite] : [];
  });
}

function prerequisitePlacement(set: SetSummary, prerequisiteId: string): number | undefined {
  return set.prerequisites?.find(({ setId }) => setId === prerequisiteId)?.placement;
}
