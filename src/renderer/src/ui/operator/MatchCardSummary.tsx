import type { ReactNode } from 'react';
import type { ReportOutcome } from '@shared/models';
import { useTranslation } from 'react-i18next';
import './matchCard.css';

type MatchCardSummaryProps = {
  context: string;
  playerOne: string;
  playerTwo: string;
  badges?: ReactNode;
  result?: { one: number; two: number; outcome?: { kind: ReportOutcome['kind']; winner: 'one' | 'two' } };
  queuePosition?: number;
};

export function MatchCardSummary({
  context,
  playerOne,
  playerTwo,
  badges,
  result,
  queuePosition
}: MatchCardSummaryProps) {
  const { t } = useTranslation(['operator', 'common']);
  const decisive = result !== undefined && (result.outcome !== undefined || result.one !== result.two);
  const playerOneWon = result?.outcome
    ? result.outcome.winner === 'one'
    : result !== undefined && result.one > result.two;
  const losingMark = result?.outcome?.kind === 'disqualification' ? 'DQ' : 'L';
  const oneMark = playerOneWon ? 'W' : losingMark;
  const twoMark = playerOneWon ? losingMark : 'W';
  const finalScore = result?.outcome ? { one: oneMark, two: twoMark } : result;
  return (
    <div className="match-card-summary">
      <div className="match-card-topline">
        <span className="match-card-context" title={context}>
          {context}
        </span>
        {badges && <div className="match-card-badges">{badges}</div>}
      </div>
      <div className="match-card-matchup">
        <span className="match-card-player match-card-player-one">
          {decisive && <ResultMarker mark={oneMark} />}
          <span className="match-card-player-name">{playerOne}</span>
        </span>
        <span className="match-card-versus">{t('common:match.versus')}</span>
        <span className="match-card-player match-card-player-two">
          <span className="match-card-player-name">{playerTwo}</span>
          {decisive && <ResultMarker mark={twoMark} />}
        </span>
      </div>
      <div className="match-card-footer">
        {finalScore && <span className="match-card-final-score">{t('common:match.finalScore', finalScore)}</span>}
        {queuePosition !== undefined && queuePosition >= 0 && (
          <span className="match-card-queue-position">
            {t('operator:queue.queued', { position: queuePosition + 1 })}
          </span>
        )}
      </div>
    </div>
  );
}

function ResultMarker({ mark }: { mark: 'W' | 'L' | 'DQ' }) {
  const { t } = useTranslation('operator');
  const winner = mark === 'W';
  const label = t(mark === 'DQ' ? 'selector.disqualified' : winner ? 'selector.winner' : 'selector.loser');
  return (
    <span className={`match-card-outcome ${winner ? 'is-winner' : 'is-loser'}`} title={label} aria-label={label}>
      {mark}
    </span>
  );
}
