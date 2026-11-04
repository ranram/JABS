import { Checkbox, SegmentedControl, Select, Slider, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queueTickerApi, useQueueTicker } from '../../hooks/useQueueTicker';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';
import { gameProfiles } from '@shared/gameProfiles';
import { sortByLabel } from '../operator/operatorUtils';
import type { LogoAsset } from '@shared/models';
import { QueueTickerBar } from './QueueTicker';
import './queueTickerControls.css';

export function QueueTickerControls({ logos }: { logos: LogoAsset[] }) {
  const { t, i18n } = useTranslation('operator');
  const notify = useOperatorNotifications();
  const live = useQueueTicker();
  const draft = useSettingsDraft({
    load: async () => (await queueTickerApi.current()).settings,
    save: async (settings) => (await queueTickerApi.update(settings)).settings,
    onError: () => notify(t('queueTicker.saveFailed'), 'error')
  });
  const [count, setCount] = useState<number>();
  const [previewLane, setPreviewLane] = useState<'upcoming' | 'results'>('upcoming');
  const settings = draft.state;
  if (!settings) return <Text size="sm">{t('queueTicker.loading')}</Text>;
  return (
    <Stack gap="md" p="md" className="queue-ticker-controls">
      <Switch
        label={t('queueTicker.enabled')}
        checked={settings.enabled}
        disabled={draft.saving}
        onChange={(event) => void draft.update({ enabled: event.currentTarget.checked })}
      />
      <div className="queue-ticker-settings-grid">
        <div>
          <Text fw={700} size="sm" mb={4}>
            {t('queueTicker.composition')}
          </Text>
          <SegmentedControl
            fullWidth
            aria-label={t('queueTicker.composition')}
            value={settings.style}
            data={[
              { value: 'compact', label: t('queueTicker.compact') },
              { value: 'standard', label: t('queueTicker.standard') }
            ]}
            disabled={draft.saving}
            onChange={(value) => {
              if (value === 'standard' || value === 'compact') void draft.update({ style: value });
            }}
          />
        </div>
        <Select
          label={t('workspaces.styling')}
          searchable
          clearable
          clearButtonProps={{ 'aria-label': t('workspaces.liveStyle') }}
          placeholder={t('workspaces.liveStyle')}
          value={settings.stylingGameId ?? null}
          data={sortByLabel(
            Object.values(gameProfiles),
            (profile) => profile.styleName,
            i18n.resolvedLanguage ?? i18n.language
          ).map((profile) => ({ value: profile.id, label: profile.styleName }))}
          disabled={draft.saving}
          onChange={(value) => {
            void draft.update({ stylingGameId: value ?? undefined });
          }}
        />
      </div>
      <div className="queue-ticker-content-grid">
        <Stack gap={6}>
          <Text size="sm" fw={650}>
            {t('queueTicker.count')}
          </Text>
          <Slider
            min={1}
            max={3}
            step={1}
            value={count ?? settings.upcomingCount}
            aria-label={t('queueTicker.count')}
            disabled={draft.saving}
            marks={[1, 2, 3].map((value) => ({ value, label: String(value) }))}
            onChange={setCount}
            onChangeEnd={(value) => {
              void draft.update({ upcomingCount: value }).then(() => setCount(undefined));
            }}
            mb="md"
          />
        </Stack>
        <Stack gap={6}>
          <Checkbox
            label={t('queueTicker.showResults')}
            checked={settings.showResults}
            disabled={draft.saving}
            onChange={(event) => void draft.update({ showResults: event.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            {t('queueTicker.resultsHelp')}
          </Text>
        </Stack>
        <div className="queue-ticker-logo-controls">
          <Checkbox
            label={t('queueTicker.showLogo')}
            checked={settings.showLogo}
            disabled={draft.saving}
            onChange={(event) => void draft.update({ showLogo: event.currentTarget.checked })}
          />
          {settings.showLogo && (
            <Select
              aria-label={t('queueTicker.logo')}
              placeholder={t('broadcast.chooseLogo')}
              searchable
              clearable
              value={settings.logoAssetId ?? null}
              data={logos.map((logo) => ({ value: logo.id, label: logo.label }))}
              disabled={draft.saving || !logos.length}
              description={logos.length ? undefined : t('broadcast.logoHint')}
              onChange={(value) => void draft.update({ logoAssetId: value ?? undefined })}
            />
          )}
        </div>
      </div>
      {live.state && (live.state.upcoming.length > 0 || live.state.results.length > 0) ? (
        <div className="queue-ticker-preview">
          {settings.showResults && live.state.upcoming.length > 0 && live.state.results.length > 0 && (
            <SegmentedControl
              hidden
              display="none"
              mb="xs"
              aria-label={t('queueTicker.preview')}
              value={previewLane}
              data={[
                { value: 'upcoming', label: t('queueTicker.upcoming') },
                { value: 'results', label: t('queueTicker.results') }
              ]}
              onChange={(value) => {
                if (value === 'upcoming' || value === 'results') setPreviewLane(value);
              }}
            />
          )}
          <QueueTickerBar state={{ ...live.state, settings }} preview previewLane={previewLane} />
        </div>
      ) : (
        <Text size="sm" c="dimmed">
          {t('queueTicker.empty')}
        </Text>
      )}
    </Stack>
  );
}
