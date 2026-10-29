import { Checkbox, Select, SimpleGrid, Stack } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogoAsset, SelectedSetState } from '@shared/models';
import { BufferedTextInput } from './BufferedTextInput';
import { emptyToUndefined, sortByLabel } from './operatorUtils';

type Broadcast = NonNullable<SelectedSetState['broadcast']>;

export function StreamBroadcastControls({
  logoSelectId,
  broadcast,
  isExhibition,
  logos,
  onChange
}: {
  logoSelectId?: string;
  broadcast?: Broadcast;
  isExhibition: boolean;
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
    <Stack gap="md" data-testid="broadcast-extras">
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
          id={logoSelectId}
          styles={{ input: { scrollMarginTop: 'calc(var(--workspace-header-height, 100px) + 40px)' } }}
          data-testid="editor-logo-asset"
          label={t(isExhibition ? 'editor.exhibitionLogo' : 'broadcast.logo')}
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
      <SimpleGrid
        className="scoreboard-visibility-options"
        type="container"
        cols={{ base: 1, '36rem': 3 }}
      >
        {!isExhibition && (
          <Checkbox
            data-testid="editor-seeds-enabled"
            checked={broadcast?.seedsEnabled ?? true}
            label={t('broadcast.showSeeds')}
            onChange={(event) => onChange({ seedsEnabled: event.currentTarget.checked })}
          />
        )}
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
          label={t(isExhibition ? 'editor.showExhibitionLogo' : 'broadcast.showLogo')}
          onChange={(event) =>
            onChange({
              logoEnabled: event.currentTarget.checked,
              logoAssetId: broadcast?.logoAssetId ?? logos[0]?.id
            })
          }
        />
      </SimpleGrid>
    </Stack>
  );
}
