import type { NoticeSink } from './operatorNotice';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { scoreLimitForBestOf, type GameId } from '@shared/gameProfiles';
import { characterTeamSelection } from '@shared/characterTeams';
import type { SelectedSetState, SetSummary, StartggResultMeta } from '@shared/models';
import { startggReportReadiness, type StartggReportReadiness } from '@shared/startggReporting';
import type { StartggGateway } from '@shared/startggGateway';
import { errorMessage, setQuickScoreValue } from './operatorUtils';
import { restoreModeratedSet, restoreModeratedSummary } from './moderationRefresh';

type UseQuickScoreActionsOptions = {
  startgg: StartggGateway;
  setLoadGameId?: GameId;
  selectedEventId: string;
  tournamentSlug: string;
  assetCatalogSlug?: string;
  setMessage: NoticeSink;
  setTokenVerified: Dispatch<SetStateAction<boolean>>;
  refreshAfterReport(): Promise<boolean>;
  readinessReason(readiness: StartggReportReadiness): string;
};

const missingSetReadiness = {
  ready: false as const,
  reason: 'Load a start.gg set before reporting a result.',
  reasonCode: 'set-missing' as const
};

export function useQuickScoreActions({
  startgg,
  setLoadGameId,
  selectedEventId,
  tournamentSlug,
  assetCatalogSlug,
  setMessage,
  setTokenVerified,
  refreshAfterReport,
  readinessReason
}: UseQuickScoreActionsOptions) {
  const { t } = useTranslation('operator');
  const [target, setTarget] = useState<SetSummary>();
  const [scoreState, setScoreState] = useState<SelectedSetState>();
  const [baseline, setBaseline] = useState<SelectedSetState>();
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<string>();
  const readiness = scoreState ? startggReportReadiness(scoreState) : missingSetReadiness;

  function recordResult(result: StartggResultMeta): void {
    setTokenVerified(result.source === 'live');
  }

  function open(set: SetSummary): void {
    setTarget(set);
    setScoreState(undefined);
    setBaseline(undefined);
    setReceipt(undefined);
  }

  function close(): void {
    if (loading) return;
    setTarget(undefined);
    setScoreState(undefined);
    setBaseline(undefined);
    setReceipt(undefined);
  }

  async function begin(nextTarget = target, closeOnFailure = false): Promise<void> {
    if (!nextTarget || !setLoadGameId) {
      setMessage(t('browser.chooseProfile'), 'warning');
      return;
    }
    setLoading(true);
    setReceipt(undefined);
    setMessage(undefined, 'info');
    try {
      const response = await startgg.inspectStartggSet(nextTarget.id, setLoadGameId, {
        eventId: selectedEventId || undefined,
        tournamentSlug: tournamentSlug || undefined,
        assetCatalogSlug
      });
      recordResult(response);
      setScoreState(response.selectedSet);
      setBaseline(response.selectedSet);
    } catch (error) {
      setTokenVerified(false);
      setMessage(errorMessage(error, t('messages.quickLoadFailed')), 'error');
      if (closeOnFailure) setTarget(undefined);
    } finally {
      setLoading(false);
    }
  }

  async function refreshModerated(): Promise<void> {
    if (!target || !setLoadGameId) return;
    const response = await startgg.inspectStartggSet(target.id, setLoadGameId, {
      eventId: selectedEventId || undefined,
      tournamentSlug: tournamentSlug || undefined,
      assetCatalogSlug
    });
    recordResult(response);
    setTarget((current) => current
      ? restoreModeratedSummary(current, response.selectedSet)
      : current);
    setScoreState((current) => current
      ? restoreModeratedSet(current, response.selectedSet)
      : current);
    setBaseline((current) => current
      ? restoreModeratedSet(current, response.selectedSet)
      : current);
  }

  function changeScore(side: 'one' | 'two', score: number): void {
    setScoreState((current) => current ? setQuickScoreValue(current, side, score) : current);
  }

  function changeBestOf(bestOf: number): void {
    setScoreState((current) => {
      if (!current) return current;
      let next = { ...current, bestOf };
      const maxScore = scoreLimitForBestOf(next.gameId, bestOf);
      next = setQuickScoreValue(next, 'one', Math.min(next.playerOne.score, maxScore));
      return setQuickScoreValue(next, 'two', Math.min(next.playerTwo.score, maxScore));
    });
  }

  function changeCharacters(side: 'one' | 'two', characters: string[]): void {
    setScoreState((current) => {
      if (!current) return current;
      const playerKey = side === 'one' ? 'playerOne' : 'playerTwo';
      return {
        ...current,
        [playerKey]: {
          ...current[playerKey],
          ...characterTeamSelection(characters, current[playerKey])
        }
      };
    });
  }

  function resetScores(): void {
    setScoreState((current) => current ? {
      ...current,
      gameHistory: [],
      playerOne: { ...current.playerOne, score: 0 },
      playerTwo: { ...current.playerTwo, score: 0 }
    } : current);
  }

  async function report(): Promise<void> {
    if (!scoreState || !baseline) {
      setMessage(t('messages.quickSetRequired'), 'warning');
      return;
    }
    if (!readiness.ready) {
      setMessage(readinessReason(readiness), 'warning');
      return;
    }
    const result = readiness.result;
    if (!window.confirm(t('messages.quickConfirm', {
      winner: result.winnerName,
      playerOne: scoreState.playerOne.name,
      scoreOne: scoreState.playerOne.score,
      scoreTwo: scoreState.playerTwo.score,
      playerTwo: scoreState.playerTwo.name,
      setId: result.setId
    }))) return;

    setLoading(true);
    setMessage(undefined, 'info');
    try {
      const response = await startgg.quickReportStartggSet({
        setId: result.setId,
        gameId: scoreState.gameId,
        bestOf: scoreState.bestOf,
        expected: {
          state: baseline.state,
          playerOneEntrantId: baseline.playerOne.entrantId,
          playerTwoEntrantId: baseline.playerTwo.entrantId,
          playerOneScore: baseline.playerOne.score,
          playerTwoScore: baseline.playerTwo.score
        },
        playerOneScore: scoreState.playerOne.score,
        playerTwoScore: scoreState.playerTwo.score,
        gameHistory: scoreState.gameHistory,
        confirmed: true
      });
      setTokenVerified(true);
      const characterNotice = response.reportedCharacterSelectionCount > 0
        ? ` ${t('messages.characterSelectionsReported', {
            count: response.reportedCharacterSelectionCount
          })}`
        : '';
      const nextReceipt = `${t('messages.quickReceipt', {
        winner: result.winnerName,
        winnerScore: result.winnerScore,
        loserScore: result.loserScore,
        setId: response.reportedSetId,
        completion: response.reportedSetState === '3' ? t('messages.markedComplete') : ''
      })}${characterNotice}`;
      setReceipt(nextReceipt);
      setScoreState((current) => current ? { ...current, state: response.reportedSetState } : current);
      const refreshed = await refreshAfterReport();
      setMessage(refreshed ? nextReceipt : `${nextReceipt} ${t('messages.selectorRefreshFailed')}`, refreshed ? 'success' : 'warning');
    } catch (error) {
      setTokenVerified(false);
      setMessage(errorMessage(error, t('messages.quickReportFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }

  return {
    target,
    scoreState,
    loading,
    receipt,
    readiness,
    open,
    close,
    begin,
    refreshModerated,
    changeScore,
    changeBestOf,
    changeCharacters,
    resetScores,
    report
  };
}
