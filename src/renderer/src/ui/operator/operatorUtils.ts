import type { StartggReportReadiness } from '@shared/startggReporting';
import { scoreLimitForBestOf } from '@shared/gameProfiles';
import { recordedCharacterSelections, updateRecordedGameHistory } from '@shared/gameHistory';
import type { SelectedSetState, SetSummary, StartggSetScope } from '@shared/models';
import { i18n } from '../../i18n';

export function setQuickScoreValue(
  selectedSet: SelectedSetState,
  side: 'one' | 'two',
  requestedScore: number
): SelectedSetState {
  const score = Math.min(Math.max(0, requestedScore), scoreLimitForBestOf(selectedSet.gameId, selectedSet.bestOf));
  const player = side === 'one' ? selectedSet.playerOne : selectedSet.playerTwo;
  const otherPlayer = side === 'one' ? selectedSet.playerTwo : selectedSet.playerOne;
  return {
    ...selectedSet,
    gameHistory: updateRecordedGameHistory(
      selectedSet.gameHistory,
      player.entrantId,
      player.score,
      score,
      otherPlayer.score,
      recordedCharacterSelections(selectedSet)
    ),
    playerOne: side === 'one' ? { ...selectedSet.playerOne, score } : selectedSet.playerOne,
    playerTwo: side === 'two' ? { ...selectedSet.playerTwo, score } : selectedSet.playerTwo
  };
}

export function setPhaseContext(set: SetSummary): string {
  return [set.phase, set.phaseGroup].filter(Boolean).join(' · ');
}

export function phaseContext(set: SelectedSetState): string {
  return [set.phase, set.phaseGroup].filter(Boolean).join(' · ');
}

export function setStatusTone(set: SetSummary, activeSetId?: string): 'stream' | 'completed' | 'pending' {
  if (set.id === activeSetId) return 'stream';
  return set.state === '3' ? 'completed' : 'pending';
}

export function emptyToUndefined(value: string): string | undefined {
  return value || undefined;
}

export function sortByLabel<T>(items: readonly T[], label: (item: T) => string, locale?: string): T[] {
  return [...items].sort((left, right) =>
    label(left).localeCompare(label(right), locale, { numeric: true, sensitivity: 'base' })
  );
}

export function localizedScopeLabel(scope: StartggSetScope): string {
  switch (scope.type) {
    case 'phase':
      return i18n.t('operator:selector.scope.phase');
    case 'phaseGroup':
      return i18n.t('operator:selector.scope.pool');
    case 'station':
      return i18n.t('operator:selector.scope.station', { number: scope.stationNumber });
    default:
      return i18n.t('operator:selector.scope.event');
  }
}

export function setScopeKey(scope: StartggSetScope | undefined): string | undefined {
  if (!scope) return undefined;
  switch (scope.type) {
    case 'event':
      return `event:${scope.eventId}`;
    case 'phase':
      return `phase:${scope.eventId}:${scope.phaseId}`;
    case 'phaseGroup':
      return `phase-group:${scope.eventId}:${scope.phaseGroupId}`;
    case 'station':
      return `station:${scope.eventId}:${scope.stationNumber}`;
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function localizedReadinessReason(readiness: StartggReportReadiness): string {
  if (readiness.ready) return '';
  switch (readiness.reasonCode) {
    case 'already-complete':
      return i18n.t('operator:readiness.alreadyComplete');
    case 'set-missing':
      return i18n.t('operator:readiness.setMissing');
    case 'entrants-missing':
      return i18n.t('operator:readiness.entrantsMissing');
    case 'score-incomplete':
      return i18n.t('operator:readiness.scoreIncomplete', {
        bestOf: readiness.bestOf ?? '',
        target: readiness.target ?? ''
      });
    case 'history-mismatch':
      return i18n.t('operator:readiness.historyMismatch');
  }
}
