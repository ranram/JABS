import { Button, Group, Stack, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { LibraryPlayer } from '@shared/playerLibrary';

type Detail = 'name' | 'prefix' | 'xHandle' | 'pronouns' | 'nickname' | 'playerPhotoAssetId';
export function PlayerLibraryField({
  field,
  player,
  onChange
}: {
  field: Detail;
  player: LibraryPlayer;
  onChange(player: LibraryPlayer): void;
}) {
  const { t } = useTranslation('operator');
  const imported = field in player.imported ? (player.imported[field as keyof typeof player.imported] ?? '') : '';
  return (
    <Stack gap={4}>
      <TextInput
        label={t(`players.fields.${field}`)}
        description={
          field === 'nickname'
            ? t('players.nicknameHelp')
            : field === 'playerPhotoAssetId'
              ? t('players.photoHelp')
              : undefined
        }
        inputWrapperOrder={['label', 'input', 'description', 'error']}
        value={player.overrides[field] ?? imported}
        onChange={(event) =>
          onChange({ ...player, overrides: { ...player.overrides, [field]: event.currentTarget.value } })
        }
      />
      <Group mih={24}>
        {field !== 'nickname' && Object.hasOwn(player.overrides, field) && (
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => {
              const overrides = { ...player.overrides };
              delete overrides[field];
              onChange({ ...player, overrides });
            }}
          >
            {t('players.useImported')}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
