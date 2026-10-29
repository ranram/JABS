import { MatchCardSummary } from './MatchCardSummary';
import { memo } from 'react';
import { Badge, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SetSummary, StartggStreamAssignment } from '@shared/models';
import { setStatusTone } from './operatorUtils';
import { displayPhaseName } from '@shared/matchContext';
import { StreamAssignmentLabel } from './StreamAssignmentLabel';

const statusColors = {
  stream: 'green',
  completed: 'blue',
  pending: 'gray'
} as const;

type SetResultRowProps = {
  set: SetSummary;
  assignment?: StartggStreamAssignment;
  queuePosition?: number;
  activeSetId?: string;
  disabled: boolean;
  onOpenSet(set: SetSummary): void;
};

export const SetResultRow = memo(
  function SetResultRow({ set, assignment, queuePosition, activeSetId, disabled, onOpenSet }: SetResultRowProps) {
    const { t } = useTranslation(['operator', 'common']);
    const status = setStatusTone(set, activeSetId);
    const outcome = set.reportedOutcome;
    const winner =
      outcome &&
      (outcome.winnerId === set.entrantOne?.id ? 'one' : outcome.winnerId === set.entrantTwo?.id ? 'two' : undefined);
    const result =
      set.state === '3' &&
      (winner || (typeof set.entrantOneScore === 'number' && typeof set.entrantTwoScore === 'number'))
        ? {
            one: set.entrantOneScore ?? 0,
            two: set.entrantTwoScore ?? 0,
            outcome: outcome && winner ? ({ kind: outcome.kind, winner } as const) : undefined
          }
        : undefined;

    return (
      <UnstyledButton
        data-testid={`set-${set.id}`}
        data-set-id={set.id}
        className="set-row"
        data-on-stream={set.id === activeSetId}
        data-queued={queuePosition !== undefined && queuePosition >= 0}
        aria-label={t('operator:ux.inspectMatch', {
          one: set.entrantOne?.name ?? t('operator:selector.tbd'),
          two: set.entrantTwo?.name ?? t('operator:selector.tbd')
        })}
        disabled={disabled}
        onClick={() => onOpenSet(set)}
      >
        <MatchCardSummary
          context={[displayPhaseName(set.phase), set.round ?? `Set ${set.id}`].filter(Boolean).join(' · ')}
          playerOne={set.entrantOne?.name ?? t('operator:selector.tbd')}
          playerTwo={set.entrantTwo?.name ?? t('operator:selector.tbd')}
          result={result}
          queuePosition={queuePosition}
          badges={
            <>
              {assignment && (
                <Badge className="match-card-stream-badge" size="sm" variant="light">
                  <StreamAssignmentLabel assignment={assignment} iconSize={12} />
                </Badge>
              )}
              <Badge className="set-flag-status" color={statusColors[status]} size="sm" variant="light">
                {set.id === activeSetId
                  ? t('common:status.onStream')
                  : set.state === '3'
                    ? t('common:status.completed')
                    : t('common:status.pending')}
              </Badge>
            </>
          }
        />
      </UnstyledButton>
    );
  },
  (previous, next) =>
    previous.set === next.set &&
    previous.assignment === next.assignment &&
    previous.activeSetId === next.activeSetId &&
    previous.disabled === next.disabled &&
    previous.queuePosition === next.queuePosition &&
    previous.onOpenSet === next.onOpenSet
);
