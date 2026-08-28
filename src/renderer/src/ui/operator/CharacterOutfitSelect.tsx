import { Select } from '@mantine/core';
import type { GameCharacterAsset } from '@shared/models';
import { characterOutfitOptions, selectedCharacterAssetId } from '@shared/characterAssets';
import { useTranslation } from 'react-i18next';

type CharacterOutfitSelectProps = {
  subject: { character?: string; characters?: string[]; characterAssetId?: string };
  assets: readonly GameCharacterAsset[];
  disabled?: boolean;
  testId?: string;
  onChange(assetId: string): void;
};

export function CharacterOutfitSelect({
  subject,
  assets,
  disabled,
  testId,
  onChange
}: CharacterOutfitSelectProps) {
  const { t } = useTranslation('operator');
  const options = characterOutfitOptions(subject, assets);
  if (options.length < 2) return null;

  return (
    <Select
      data-testid={testId}
      label={t('editor.colorOutfit')}
      description={t('editor.colorOutfitHelp')}
      data={options.map((option) => ({
        ...option,
        label: option.label === 'Default' ? t('editor.defaultOutfit') : option.label
      }))}
      value={selectedCharacterAssetId(subject, assets) ?? null}
      allowDeselect={false}
      disabled={disabled}
      onChange={(value) => value && onChange(value)}
    />
  );
}
