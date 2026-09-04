import { Select } from '@mantine/core';
import type { GameCharacterAsset } from '@shared/models';
import { characterOutfitOptions, selectedCharacterAssetId } from '@shared/characterAssets';
import { playerCharacters } from '@shared/characterTeams';
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
  const selectedCharacters = playerCharacters(subject);
  const hasCharacter = selectedCharacters.length > 0;
  const hasExtraOutfits = options.length >= 2;
  const isDisabled = disabled || !hasCharacter || !hasExtraOutfits;
  const placeholder = !hasCharacter
    ? t('editor.selectCharacterFirst')
    : !hasExtraOutfits
      ? t('editor.noExtraOutfits')
      : undefined;

  return (
    <Select
      data-testid={testId}
      label={t('editor.colorOutfit')}
      description={t('editor.colorOutfitHelp')}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      placeholder={placeholder}
      data={options.map((option) => ({
        ...option,
        label: option.label === 'Default' ? t('editor.defaultOutfit') : option.label
      }))}
      value={selectedCharacterAssetId(subject, assets) ?? null}
      allowDeselect={false}
      disabled={isDisabled}
      onChange={(value) => value && onChange(value)}
    />
  );
}
