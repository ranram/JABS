import { Button } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlayerSide, ReportOutcome, SelectedSetState } from '@shared/models';
import type { ReportableStartggResult } from '@shared/startggReporting';
import { i18n } from '../../i18n';
import { beginPendingWrite } from '../../pendingWrites';

export function useReportOutcome(set?: SelectedSetState) {
  // A choice belongs to the match version reviewed by the operator.
  const version = JSON.stringify([
    set?.setId,
    set?.updatedAt,
    set?.state,
    set?.bestOf,
    set?.playerOne.entrantId,
    set?.playerTwo.entrantId,
    set?.playerOne.score,
    set?.playerTwo.score
  ]);
  const [choice, setChoice] = useState<{ version: string; outcome: ReportOutcome }>();
  useEffect(() => setChoice(undefined), [version]);
  const outcome = choice?.version === version ? choice.outcome : undefined;
  const hasOutcome = Boolean(outcome);
  // The pending report holds queue advancement until confirmed or cleared.
  useEffect(() => (hasOutcome ? beginPendingWrite('confirmation') : undefined), [hasOutcome]);
  function choose(next: ReportOutcome) {
    setChoice(
      outcome?.kind === next.kind && outcome.winnerId === next.winnerId ? undefined : { version, outcome: next }
    );
  }
  return { outcome, choose, clear: () => setChoice(undefined) };
}

export function reportOutcomeText(
  set: SelectedSetState,
  outcome: ReportOutcome,
  purpose: 'summary' | 'confirmation' = 'summary'
) {
  const oneWon = outcome.winnerId === set.playerOne.entrantId;
  const key =
    purpose === 'confirmation'
      ? outcome.kind === 'disqualification'
        ? 'confirmDQ'
        : 'confirmWinLoss'
      : outcome.kind === 'disqualification'
        ? 'dq'
        : 'winLoss';
  return i18n.t(`operator:outcomes.${key}`, {
    winner: oneWon ? set.playerOne.name : set.playerTwo.name,
    loser: oneWon ? set.playerTwo.name : set.playerOne.name,
    setId: set.setId ?? ''
  });
}

export function reportConfirmationText(
  set: SelectedSetState,
  result: ReportableStartggResult,
  source: 'live' | 'quick'
) {
  if (result.outcome) return reportOutcomeText(set, result.outcome, 'confirmation');
  return i18n.t(source === 'quick' ? 'operator:messages.quickConfirm' : 'operator:messages.reportConfirm', {
    winner: result.winnerName,
    playerOne: set.playerOne.name,
    scoreOne: set.playerOne.score,
    scoreTwo: set.playerTwo.score,
    playerTwo: set.playerTwo.name,
    history: result.gameData
      ? i18n.t('operator:messages.reportHistoryExact', { count: result.gameData.length })
      : i18n.t('operator:messages.reportHistoryWinnerOnly'),
    setId: result.setId
  });
}

export function ResultOutcomeButtons({
  set,
  side,
  outcome,
  disabled,
  onChange
}: {
  set: SelectedSetState;
  side: PlayerSide;
  outcome?: ReportOutcome;
  disabled: boolean;
  onChange(outcome: ReportOutcome): void;
}) {
  const { t } = useTranslation('operator');
  if (!set.setId) return null;
  const player = side === 'one' ? set.playerOne : set.playerTwo;
  const opponent = side === 'one' ? set.playerTwo : set.playerOne;
  const unavailable = disabled || set.state === '3';
  const won = outcome?.winnerId === player.entrantId;
  const dq = outcome?.kind === 'disqualification' && outcome.winnerId === opponent.entrantId;
  return (
    <>
      <Button
        size="sm"
        color="green"
        variant={won ? 'filled' : 'light'}
        disabled={unavailable}
        aria-label={t('outcomes.winAction', { player: player.name })}
        aria-pressed={Boolean(won)}
        onClick={() => onChange({ kind: 'win-loss', winnerId: player.entrantId })}
      >
        W
      </Button>
      <Button
        size="sm"
        color="red"
        variant={dq ? 'filled' : 'light'}
        disabled={unavailable}
        aria-label={t('outcomes.dqAction', { player: player.name })}
        aria-pressed={Boolean(dq)}
        onClick={() => onChange({ kind: 'disqualification', winnerId: opponent.entrantId })}
      >
        DQ
      </Button>
    </>
  );
}
