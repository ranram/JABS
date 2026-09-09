import { memo } from 'react';
import { Badge, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SetSummary, StartggStreamAssignment } from '@shared/models';
import { setPhaseContext, setStatusTone } from './operatorUtils';
import { streamPlatform } from './setPillFilters';

const statusColors = {
  stream: 'green',
  completed: 'blue',
  pending: 'gray'
} as const;

type SetResultRowProps = {
  set: SetSummary;
  assignment?: StartggStreamAssignment;
  activeSetId?: string;
  disabled: boolean;
  onOpenSet(set: SetSummary): void;
};

export const SetResultRow = memo(function SetResultRow({
  set,
  assignment,
  activeSetId,
  disabled,
  onOpenSet
}: SetResultRowProps) {
  const { t } = useTranslation(['operator', 'common']);
  const status = setStatusTone(set, activeSetId);
  const hasDecisiveResult = set.state === '3'
    && set.entrantOneScore !== undefined
    && set.entrantTwoScore !== undefined
    && set.entrantOneScore !== set.entrantTwoScore;
  const playerOneWon = hasDecisiveResult && set.entrantOneScore! > set.entrantTwoScore!;

  return (
    <UnstyledButton
      data-testid={`set-${set.id}`}
      className="set-row"
      disabled={disabled}
      onClick={() => onOpenSet(set)}
    >
      <div className="set-row-topline">
        <span className="set-row-context">
          {[setPhaseContext(set), set.round ?? `Set ${set.id}`].filter(Boolean).join(' · ')}
        </span>
        <div className="set-row-flag-stack">
            {assignment && <Badge size="sm" variant="light">{t('operator:selector.streamAssignment', {
              platform: t(`operator:selector.streamPlatforms.${streamPlatform(assignment.streamSource, assignment.streamName)}`),
              name: assignment.streamName
            })}</Badge>}
            {set.station && <Badge size="sm" variant="outline">{set.station}</Badge>}
          <Badge className="set-flag-status" color={statusColors[status]} size="sm" variant="light">
            {set.id === activeSetId
              ? t('common:status.onStream')
              : set.state === '3'
                ? t('common:status.completed')
                : t('common:status.pending')}
          </Badge>
        </div>
      </div>
      <div className="set-row-matchup">
        <span className="set-row-player set-row-player-one">
          {hasDecisiveResult && (
            <span className={`set-row-outcome ${playerOneWon ? 'is-winner' : 'is-loser'}`} title={playerOneWon ? t('operator:selector.winner') : t('operator:selector.loser')} aria-label={playerOneWon ? t('operator:selector.winner') : t('operator:selector.loser')}>
              {playerOneWon ? 'W' : 'L'}
            </span>
          )}
          <span className="set-row-player-name">{set.entrantOne?.name ?? t('operator:selector.tbd')}</span>
        </span>
        <span className="set-row-versus">{t('common:match.versus')}</span>
        <span className="set-row-player set-row-player-two">
          <span className="set-row-player-name">{set.entrantTwo?.name ?? t('operator:selector.tbd')}</span>
          {hasDecisiveResult && (
            <span className={`set-row-outcome ${playerOneWon ? 'is-loser' : 'is-winner'}`} title={playerOneWon ? t('operator:selector.loser') : t('operator:selector.winner')} aria-label={playerOneWon ? t('operator:selector.loser') : t('operator:selector.winner')}>
              {playerOneWon ? 'L' : 'W'}
            </span>
          )}
        </span>
      </div>
      {set.state === '3' && set.entrantOneScore !== undefined && set.entrantTwoScore !== undefined && (
        <span className="set-row-final-score">
          {t('common:match.finalScore', { one: set.entrantOneScore, two: set.entrantTwoScore })}
        </span>
      )}
    </UnstyledButton>
  );
}, (previous, next) => (
  previous.set === next.set
  && previous.assignment === next.assignment
  && previous.activeSetId === next.activeSetId
  && previous.disabled === next.disabled
));
