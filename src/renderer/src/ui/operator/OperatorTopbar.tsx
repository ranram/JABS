import { Badge, Group, Text } from '@mantine/core';
import type { SelectedSetState } from '@shared/models';
import { hasStreamMatch } from './streamStatus';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from '../LanguageSelect';
import { AppUpdateControls } from './AppUpdateControls';
import brandLogo from '../../assets/jabs-logo.png';

type OperatorTopbarProps = {
  tokenVerified: boolean;
  tokenSessionOnly: boolean;
  tokenConfigured: boolean;
  tokenStorageAvailable: boolean;
  loading: boolean;
  updateBlocked: boolean;
  selectedSet?: SelectedSetState;
};

export function OperatorTopbar({
  tokenVerified,
  tokenSessionOnly,
  tokenConfigured,
  loading,
  updateBlocked,
  selectedSet
}: OperatorTopbarProps) {
  const { t } = useTranslation(['operator', 'common']);
  const tokenStatus = !tokenConfigured
    ? t('operator:startgg.publicAccess')
    : tokenVerified
      ? t('operator:topbar.apiVerified')
      : tokenSessionOnly
        ? t('operator:topbar.sessionToken')
        : t('operator:topbar.tokenStored');

  return (
    <header className="operator-topbar">
      <Group className="operator-brand" gap="sm" wrap="nowrap">
        <img className="brand-mark" src={brandLogo} alt="" />
        <div>
          <Text component="h1" fw={900} size="lg">
            JABS
          </Text>
          <Text size="xs" c="dimmed">
            {t('operator:appSubtitle')}
          </Text>
        </div>
      </Group>
      <Group className="operator-status-strip" wrap="wrap" justify="flex-end">
        <div className="topbar-readout">
          <Text component="span" size="xs">
            start.gg
          </Text>
          <Text component="strong" size="sm" data-testid="startgg-connection-status">
            {tokenStatus}
          </Text>
        </div>
        <div className="topbar-readout topbar-current-set">
          <Text component="span" size="xs">
            {t('operator:topbar.onStream')}
          </Text>
          <Text component="strong" size="sm" title={selectedSet?.displayName}>
            {hasStreamMatch(selectedSet) && selectedSet
              ? `${selectedSet.playerOne.name} ${selectedSet.playerOne.score} – ${selectedSet.playerTwo.score} ${selectedSet.playerTwo.name}`
              : t('operator:ux.noMatch')}
          </Text>
        </div>
        <LanguageSelect compact />
        <AppUpdateControls blocked={updateBlocked} />
        <Badge color={loading ? 'yellow' : 'green'} variant="light">
          {loading ? t('common:status.working') : t('common:status.ready')}
        </Badge>
      </Group>
    </header>
  );
}
