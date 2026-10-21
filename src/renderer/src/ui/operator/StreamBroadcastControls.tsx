import { Checkbox, Group, Paper, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogoAsset, SelectedSetState } from '@shared/models';
import { BufferedTextInput } from './BufferedTextInput';
import { emptyToUndefined, sortByLabel } from './operatorUtils';

type Broadcast = NonNullable<SelectedSetState['broadcast']>;

export function StreamBroadcastControls({
  broadcast,
  logos,
  onChange
}: {
  broadcast?: Broadcast;
  logos: LogoAsset[];
  onChange(patch: Partial<Broadcast>): void;
}) {
  const { t, i18n } = useTranslation('operator');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const logoOptions = useMemo(
    () => sortByLabel(logos, (logo) => logo.label, locale).map((logo) => ({ value: logo.id, label: logo.label })),
    [logos, locale]
  );

  return (
    <Paper className="operator-inset" p="sm" withBorder radius="md" data-testid="broadcast-extras">
      <Stack gap="sm">
        <Text fw={700}>{t('broadcast.title')}</Text>
        <Group gap="lg">
          <Checkbox
            data-testid="editor-info-bar-enabled"
            checked={broadcast?.infoBarEnabled ?? false}
            label={t('broadcast.showRails')}
            onChange={(event) => onChange({ infoBarEnabled: event.currentTarget.checked })}
          />
          <Checkbox
            data-testid="editor-logo-enabled"
            checked={broadcast?.logoEnabled ?? false}
            disabled={logos.length === 0}
            label={t('broadcast.showLogo')}
            onChange={(event) =>
              onChange({
                logoEnabled: event.currentTarget.checked,
                logoAssetId: broadcast?.logoAssetId ?? logos[0]?.id
              })
            }
          />
        </Group>
        <SimpleGrid type="container" cols={{ base: 1, '36rem': 3 }}>
          <BufferedTextInput
            data-stream-free-text="infoLeft"
            data-testid="editor-info-left"
            label={t('broadcast.leftRail')}
            value={broadcast?.infoLeft ?? ''}
            disabled={!broadcast?.infoBarEnabled}
            placeholder={t('broadcast.leftPlaceholder')}
            onCommit={(value) => onChange({ infoLeft: emptyToUndefined(value) })}
          />
          <BufferedTextInput
            data-stream-free-text="infoRight"
            data-testid="editor-info-right"
            label={t('broadcast.rightRail')}
            value={broadcast?.infoRight ?? ''}
            disabled={!broadcast?.infoBarEnabled}
            placeholder={t('broadcast.rightPlaceholder')}
            onCommit={(value) => onChange({ infoRight: emptyToUndefined(value) })}
          />
          <Select
            data-testid="editor-logo-asset"
            label={t('broadcast.logo')}
            description={logos.length === 0 ? t('broadcast.logoHint') : undefined}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            data={logoOptions}
            value={broadcast?.logoAssetId ?? null}
            disabled={logos.length === 0}
            placeholder={t('broadcast.chooseLogo')}
            searchable
            clearable
            onChange={(value) => onChange({ logoAssetId: value ?? undefined })}
          />
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
