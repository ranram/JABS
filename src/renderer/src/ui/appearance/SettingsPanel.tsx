import { useEffect, useState } from 'react';
import { DestructiveButton } from '../DestructiveButton';
import {
  Alert,
  Button,
  ColorInput,
  Divider,
  Drawer,
  FileButton,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import {
  defaultAppearance,
  exportAppearance,
  parseAppearanceFile,
  type Appearance
} from '@shared/appearancePreferences';
import { useAppearance } from './AppearanceProvider';
import { api } from '../../api';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';

export function SettingsButton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('operator');
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button size={compact ? 'compact-xs' : undefined} variant="default" onClick={() => setOpened(true)}>
        {t('appearance.settings')}
      </Button>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title={t('appearance.settings')}
        position="right"
        size="lg"
        keepMounted
      >
        <SettingsPanel />
      </Drawer>
    </>
  );
}

export function SettingsPanel() {
  const { t } = useTranslation(['operator', 'common']);
  const notify = useOperatorNotifications();
  const { state, ready, saving, error, update } = useAppearance();
  const [presetId, setPresetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [transferring, setTransferring] = useState(false);
  const appearance = state.appearance;
  const selected = state.presets.find(({ id }) => id === presetId);
  const change = (patch: Partial<Appearance>, delay = 0) =>
    void update(
      (current) => ({
        ...current,
        appearance: { ...current.appearance, ...patch }
      }),
      delay
    );

  async function importPreset(file: File | null) {
    if (!file) return;
    setTransferring(true);
    try {
      if (file.size > 65536) throw new Error('File too large');
      const imported = parseAppearanceFile(await file.text());
      const preset = { id: crypto.randomUUID(), name: imported.name, appearance: imported.appearance };
      if (
        await update((current) => ({
          ...current,
          presets: [...current.presets, preset],
          appearance: preset.appearance
        }))
      ) {
        setPresetId(preset.id);
        setName(preset.name);
      }
    } catch {
      notifications.show({ title: t('appearance.importFailed'), message: t('appearance.importHelp'), color: 'red' });
    } finally {
      setTransferring(false);
    }
  }
  async function exportPreset() {
    setTransferring(true);
    try {
      // Finish pending label edits before exporting the native, reviewed values.
      if (!(await update((current) => current))) return;
      const saved = await api.appearancePreferences();
      const text = exportAppearance(
        name.trim() || selected?.name || t('appearance.defaultPresetName'),
        saved.appearance
      );
      const filename = 'jabs-appearance.json';
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(t('messages.exportCompleted', { filename }), 'success');
    } catch {
      notifications.show({ title: t('appearance.exportFailed'), message: t('appearance.tryAgain'), color: 'red' });
    } finally {
      setTransferring(false);
    }
  }
  if (!ready)
    return (
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        <Text>{t('appearance.loading')}</Text>
      </Stack>
    );
  return (
    <Stack gap="md">
      <Text fw={700}>{t('appearance.bracketNames')}</Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label={t('bracketScreen.winners')}
          placeholder={t('bracketScreen.winners')}
          value={appearance.winnersLabel ?? ''}
          maxLength={100}
          onChange={(event) => change({ winnersLabel: event.currentTarget.value || undefined }, 350)}
        />
        <TextInput
          label={t('bracketScreen.losers')}
          placeholder={t('bracketScreen.losers')}
          value={appearance.losersLabel ?? ''}
          maxLength={100}
          onChange={(event) => change({ losersLabel: event.currentTarget.value || undefined }, 350)}
        />
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        {t('appearance.bracketNamesHelp')}
      </Text>
      <Divider />
      <Switch
        label={t('appearance.colorOverride')}
        checked={appearance.colorOverride}
        onChange={(event) => change({ colorOverride: event.currentTarget.checked })}
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <PreferenceColor
          label={t('appearance.primaryColor')}
          value={appearance.primaryColor}
          disabled={!appearance.colorOverride}
          onChange={(primaryColor) => change({ primaryColor }, 250)}
        />
        <PreferenceColor
          label={t('appearance.secondaryColor')}
          value={appearance.secondaryColor}
          disabled={!appearance.colorOverride}
          onChange={(secondaryColor) => change({ secondaryColor }, 250)}
        />
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        {t('appearance.colorHelp')}
      </Text>
      <SimpleGrid type="container" cols={{ base: 1, '28rem': 2 }}>
        <Select
          label={t('appearance.textSize')}
          value={appearance.textSize}
          data={[
            { value: 'default', label: t('appearance.defaultText') },
            { value: 'large', label: t('appearance.largeText') }
          ]}
          onChange={(value) => value && change({ textSize: value as Appearance['textSize'] })}
        />
        <Select
          label={t('appearance.broadcastLanguage')}
          value={appearance.broadcastLanguage}
          data={[
            { value: 'follow', label: t('appearance.followLanguage') },
            { value: 'en', label: t('common:languages.en') },
            { value: 'es-419', label: t('common:languages.es419') }
          ]}
          onChange={(value) => value && change({ broadcastLanguage: value as Appearance['broadcastLanguage'] })}
        />
      </SimpleGrid>
      <Switch
        label={t('appearance.animations')}
        checked={appearance.entranceAnimations}
        onChange={(event) => change({ entranceAnimations: event.currentTarget.checked })}
      />
      <Divider />
      <Text fw={700}>{t('appearance.presets')}</Text>
      <Select
        label={t('appearance.savedPreset')}
        clearable
        placeholder={t('appearance.choosePreset')}
        value={presetId}
        data={state.presets.map(({ id, name: label }) => ({ value: id, label }))}
        onChange={(id) => {
          setPresetId(id);
          const preset = state.presets.find((entry) => entry.id === id);
          setName(preset?.name ?? '');
          if (preset) void update({ appearance: preset.appearance });
        }}
      />
      <TextInput
        label={t('appearance.presetName')}
        maxLength={100}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <SimpleGrid type="container" cols={{ base: 1, '28rem': 2 }}>
        <Button
          disabled={saving || !name.trim() || (!selected && state.presets.length >= 20)}
          onClick={async () => {
            const id = selected?.id ?? crypto.randomUUID();
            if (
              await update((current) => ({
                ...current,
                presets: selected
                  ? current.presets.map((preset) =>
                      preset.id === id ? { id, name: name.trim(), appearance: current.appearance } : preset
                    )
                  : [...current.presets, { id, name: name.trim(), appearance: current.appearance }]
              }))
            )
              setPresetId(id);
          }}
        >
          {selected ? t('appearance.updatePreset') : t('appearance.savePreset')}
        </Button>
        <DestructiveButton
          disabled={!selected || saving}
          onClick={() => {
            void update((current) => ({ ...current, presets: current.presets.filter(({ id }) => id !== presetId) }));
            setPresetId(null);
            setName('');
          }}
        >
          {t('appearance.deletePreset')}
        </DestructiveButton>
        <FileButton accept="application/json,.json" onChange={(file) => void importPreset(file)}>
          {(props) => (
            <Button {...props} variant="default" disabled={transferring || saving || state.presets.length >= 20}>
              {t('appearance.importPreset')}
            </Button>
          )}
        </FileButton>
        <Button variant="default" disabled={transferring} onClick={() => void exportPreset()}>
          {t('appearance.exportPreset')}
        </Button>
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        {t('appearance.presetHelp')}
      </Text>
      <Divider />
      <Button
        variant="default"
        disabled={saving}
        onClick={() => {
          void update({ appearance: { ...defaultAppearance } });
          setPresetId(null);
          setName('');
        }}
      >
        {t('appearance.restoreDefaults')}
      </Button>
      <Text size="sm" c="dimmed">
        {t('appearance.restoreHelp')}
      </Text>
      {error && <Alert color="red">{error}</Alert>}
    </Stack>
  );
}

function PreferenceColor({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  // Keep partially typed hex values local until they are valid for persistence.
  return (
    <ColorInput
      label={label}
      format="hex"
      value={draft}
      disabled={disabled}
      onChange={(color) => {
        setDraft(color);
        if (/^#[0-9a-f]{6}$/i.test(color)) onChange(color);
      }}
      onBlur={() => setDraft(value)}
    />
  );
}
