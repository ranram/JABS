import { Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { bracketScopeKey, type BracketScreenState } from '@shared/bracketScreen';
import { displayPhaseName } from '@shared/matchContext';
import type { StartggPhase } from '@shared/models';

export function BracketScreenStatus({
  state,
  phases,
  eventId
}: {
  state?: BracketScreenState;
  phases: StartggPhase[];
  eventId?: string;
}) {
  const { t } = useTranslation('operator');
  const scope = state?.settings.scope;
  const selected = Boolean(scope && eventId && scope.eventId === eventId);
  const snapshot =
    selected && bracketScopeKey(state?.snapshot?.scope) === bracketScopeKey(scope) ? state?.snapshot : undefined;
  const phase = selected ? snapshot?.phaseName || phases.find(({ id }) => id === scope?.phaseId)?.name : undefined;
  const pool = snapshot?.groupName?.trim();
  const selection = [
    phase ? displayPhaseName(phase) : undefined,
    pool ? `${t('selector.scope.pool')} ${pool}` : undefined
  ]
    .filter(Boolean)
    .join(' · ');
  const label = selection || t(!state || selected ? 'bracketScreen.loading' : 'bracketScreen.selectionEmpty');
  return (
    <Badge
      color={selected ? 'jabs' : 'gray'}
      variant="light"
      maw="100%"
      h="auto"
      styles={{ label: { whiteSpace: 'normal' } }}
      title={label}
    >
      {label}
    </Badge>
  );
}
