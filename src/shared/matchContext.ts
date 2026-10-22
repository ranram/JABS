import type { PlayerState, SelectedSetState } from './models';

export function displayPhaseName(phase: string | undefined): string {
  const name = phase?.trim() ?? '';
  return /^pool$/i.test(name) ? 'Pools' : name;
}

export function phaseAndRound(context: { phase?: string; round?: string }): string {
  return [...new Set([displayPhaseName(context.phase), context.round?.trim()].filter(Boolean))].join(' · ');
}

export function normalizeRound(value: string | undefined): string {
  return (
    value
      ?.normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim() ?? ''
  );
}

export function matchPlayerName(player: Pick<PlayerState, 'name' | 'entrantId'>, set?: SelectedSetState): string {
  if (!set?.winnersSideEntrantId || !['grand final', 'grand finals'].includes(normalizeRound(set.round))) {
    return player.name;
  }
  const losersEntrantId =
    set.playerOne.entrantId === set.winnersSideEntrantId
      ? set.playerTwo.entrantId
      : set.playerTwo.entrantId === set.winnersSideEntrantId
        ? set.playerOne.entrantId
        : undefined;
  if (player.entrantId !== losersEntrantId || player.entrantId === set.winnersSideEntrantId) return player.name;
  return player.entrantId === set.playerTwo.entrantId ? `[L] ${player.name}` : `${player.name} [L]`;
}
