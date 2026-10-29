import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { OperatorIcon, MagnifyingGlassIcon } from '../icons';

type Props = { disabled: boolean; loading: boolean; onLookup(reference: string): void; actions?: ReactNode };
export function PlayerProfileLookup({ disabled, loading, onLookup, actions }: Props) {
  const { t } = useTranslation('operator');
  const [reference, setReference] = useState('');
  const helpId = useId();
  const submit = () => {
    if (!disabled && reference.trim()) onLookup(reference.trim());
  };
  return (
    <Stack className="player-library-lookup" gap={4}>
      <Group align="flex-end" wrap="nowrap">
        <TextInput
          label={t('players.lookupLabel')}
          placeholder={t('players.lookupPlaceholder')}
          aria-describedby={helpId}
          value={reference}
          disabled={disabled}
          maxLength={1024}
          style={{ flex: 1, minWidth: 0 }}
          onChange={(event) => setReference(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button
          w={112}
          px={0}
          aria-label={t('players.lookup')}
          title={t('players.lookup')}
          loading={loading}
          disabled={disabled || !reference.trim()}
          onClick={submit}
        >
          <OperatorIcon icon={MagnifyingGlassIcon} />
        </Button>
        {actions}
      </Group>
      <Text id={helpId} size="xs" c="dimmed">
        {t('players.lookupHelp')}
      </Text>
    </Stack>
  );
}
