import { Alert, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { HintedButton } from './HintedButton';
import { SetActionsModal } from './SetActionsModal';
import type { useQuickScoreActions } from './useQuickScoreActions';
import { localizedReadinessReason } from './operatorUtils';
import { useMatchQueue } from './matchQueueContext';

type Props = {
  quickScore: ReturnType<typeof useQuickScoreActions>;
  reportingEnabled: boolean;
  loading: boolean;
  characterOptions: readonly string[];
  onSendToStream(setId: string): void;
};
export function DashboardSetActions({ quickScore: q, ...props }: Props) {
  const queue = useMatchQueue();
  const { t } = useTranslation('operator');
  const position =
    queue?.state?.context?.eventId === queue?.context?.eventId
      ? (queue?.state?.entries.findIndex((e) => e.setId === q.target?.id) ?? -1)
      : -1;
  return (
    <SetActionsModal
      {...props}
      target={q.target}
      quickScore={q.scoreState}
      receipt={q.receipt}
      quickReadiness={q.readiness}
      quickReadinessReason={localizedReadinessReason(q.readiness)}
      quickScoreLoading={q.loading}
      onClose={q.close}
      onSendToStream={(id) => {
        q.close();
        props.onSendToStream(id);
      }}
      onBeginQuickScore={() => void q.begin()}
      onChangeBestOf={q.changeBestOf}
      onChangeScore={q.changeScore}
      onChangeCharacters={q.changeCharacters}
      onResetScores={q.resetScores}
      onReport={(outcome) => void q.report(outcome)}
      queueAction={
        queue && (
          <Stack gap="xs">
            <HintedButton
              reason={
                queue.state?.context && queue.state.context.eventId !== queue.context?.eventId
                  ? t('queue.otherEvent')
                  : undefined
              }
              fullWidth
              variant="default"
              loading={queue.busy}
              disabled={
                !queue.state ||
                !queue.context ||
                !q.target ||
                Boolean(queue.state.context && queue.state.context.eventId !== queue.context.eventId)
              }
              onClick={() => {
                if (position >= 0) {
                  q.close();
                  queue.open();
                } else if (q.target) void queue.add(q.target.id);
              }}
            >
              {position >= 0 ? t('queue.queued', { position: position + 1 }) : t('queue.add')}
            </HintedButton>
            {queue.error && (
              <Alert color="red">
                <Text size="sm">{queue.error}</Text>
              </Alert>
            )}
          </Stack>
        )
      }
    />
  );
}
