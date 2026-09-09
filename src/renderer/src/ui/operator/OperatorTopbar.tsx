import { Badge, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SelectedSetState } from '@shared/models';
import { LanguageSelect } from '../LanguageSelect';

type OperatorTopbarProps = {
  tokenVerified: boolean;
  tokenSessionOnly: boolean;
  tokenConfigured: boolean;
  tokenStorageAvailable: boolean;
  loading: boolean;
  selectedSet?: SelectedSetState;
};

export function OperatorTopbar({
  tokenVerified,
  tokenSessionOnly,
  tokenConfigured,
  loading,
  selectedSet
}: OperatorTopbarProps) {
  const { t } = useTranslation(['operator', 'common']);
  const tokenStatus = !tokenConfigured ? t('operator:startgg.publicAccess') : tokenVerified
    ? t('operator:topbar.apiVerified')
    : tokenSessionOnly
      ? t('operator:topbar.sessionToken')
      : t('operator:topbar.tokenStored');

  return (
    <header className="operator-topbar">
      <Group className="operator-brand" gap="sm" wrap="nowrap">
        <span className="brand-mark">J</span>
        <div>
          <Text component="h1" fw={900} size="lg">JABS</Text>
          <Text size="xs" c="dimmed">{t('operator:appSubtitle')}</Text>
        </div>
      </Group>
      <Group className="operator-status-strip" wrap="wrap" justify="flex-end">
        <div className="topbar-readout">
          <Text component="span" size="xs">start.gg</Text>
          <Text component="strong" size="sm" data-testid="startgg-connection-status">{tokenStatus}</Text>
        </div>
        <div className="topbar-readout topbar-current-set">
          <Text component="span" size="xs">{t('operator:topbar.onStream')}</Text>
          <Text component="strong" size="sm">{selectedSet?.displayName ?? t('operator:topbar.loadingState')}</Text>
        </div>
        <LanguageSelect compact />
        <Badge color={loading ? 'yellow' : 'green'} variant="light">
          {loading ? t('common:status.working') : t('common:status.ready')}
        </Badge>
      </Group>
    </header>
  );
}
