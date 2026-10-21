import { Button, Group, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = { disabled: boolean; loading: boolean; onLookup(reference: string): void };
export function PlayerProfileLookup({ disabled, loading, onLookup }: Props) {
  const { t } = useTranslation('operator');
  const [reference, setReference] = useState('');
  const submit = () => {
    if (!disabled && reference.trim()) onLookup(reference.trim());
  };
  return (
    <Group align="flex-end" className="player-library-lookup" wrap="nowrap">
      <TextInput
        label={t('players.lookupLabel')}
        placeholder={t('players.lookupPlaceholder')}
        description={t('players.lookupHelp')}
        inputWrapperOrder={['label', 'input', 'description', 'error']}
        value={reference}
        disabled={disabled}
        maxLength={1024}
        style={{ flex: 1 }}
        onChange={(event) => setReference(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
      />
      <Button loading={loading} disabled={disabled || !reference.trim()} onClick={submit}>
        {t('players.lookup')}
      </Button>
    </Group>
  );
}
