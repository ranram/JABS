import { useRef, useState } from 'react';
import { Accordion, ActionIcon, Button, FileButton, Group, Select, Stack, Switch, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { maxFontFileBytes, type ImportedFont } from '@shared/fonts';
import { api } from '../../api';
import { invalidateCatalogConsumers } from '../../hooks/useCatalogRevision';
import { useAppearance } from '../appearance/AppearanceProvider';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';
import { OperatorIcon, TrashSimpleIcon } from '../icons';
import { useImportedFonts } from './useScoreboardFont';

export function ImportedFontSettings() {
  const { t } = useTranslation('operator');
  const { state, update } = useAppearance();
  const notify = useOperatorNotifications();
  const resetFile = useRef<() => void>(null);
  const [importing, setImporting] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string>();
  const fonts = useImportedFonts(opened === 'fonts');
  const enabled = state.showImportedFonts === true;

  async function importFont(file: File | null) {
    if (!file) return;
    setImporting(true);
    try {
      if (!/\.(ttf|otf)$/i.test(file.name) || file.size > maxFontFileBytes) {
        notify(t('appearance.fontFileInvalid'), 'error');
        return;
      }
      try {
        await new FontFace('JABS import check', await file.arrayBuffer()).load();
      } catch {
        notify(t('appearance.fontFileInvalid'), 'error');
        return;
      }
      const name = file.name.replace(/\.(ttf|otf)$/i, '').trim().slice(0, 100);
      const imported = await api.importFont(name, file);
      invalidateCatalogConsumers(false);
      notify(t('appearance.fontImported', { name: imported.name }), 'success');
    } catch {
      notify(t('appearance.fontImportFailed'), 'error');
    } finally {
      resetFile.current?.();
      setImporting(false);
    }
  }

  async function deleteFont(font: ImportedFont) {
    if (!window.confirm(t('appearance.deleteFontConfirm', { name: font.name }))) return;
    setDeleting(font.id);
    try {
      await api.deleteImportedFont(font.id);
      invalidateCatalogConsumers(false);
      if (state.scoreboardFont === font.id) {
        await update((current) => current.scoreboardFont === font.id
          ? { ...current, scoreboardFont: undefined }
          : current);
      }
      notify(t('appearance.fontDeleted', { name: font.name }), 'success');
    } catch {
      notify(t('appearance.fontDeleteFailed'), 'error');
    } finally {
      setDeleting(undefined);
    }
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Switch
          label={t('appearance.showImportedFonts')}
          checked={enabled}
          onChange={(event) => void update({ showImportedFonts: event.currentTarget.checked })}
        />
        <FileButton accept=".ttf,.otf" resetRef={resetFile} onChange={(file) => void importFont(file)}>
          {(props) => (
            <Button {...props} variant="default" loading={importing} disabled={!enabled}>
              {t('appearance.addFont')}
            </Button>
          )}
        </FileButton>
      </Group>
      <Select
        label={t('appearance.scoreboardTextScale')}
        data={[100, 110, 120, 130].map((size) => ({ value: String(size), label: `${size}%` }))}
        value={String(state.scoreboardTextScale ?? 100)}
        allowDeselect={false}
        onChange={(value) => {
          if (value) void update({ scoreboardTextScale: value === '100' ? undefined : Number(value) });
        }}
      />
      <Accordion value={opened} onChange={setOpened} variant="contained">
        <Accordion.Item value="fonts">
          <Accordion.Control>{t('appearance.importedFonts')}</Accordion.Control>
          <Accordion.Panel>
            {fonts.length ? (
              <Stack gap="xs">
                {[...fonts].sort((a, b) => a.name.localeCompare(b.name)).map((font) => (
                  <Group key={font.id} justify="space-between" wrap="nowrap">
                    <Text size="sm" flex={1} miw={0} truncate title={font.name}>{font.name}</Text>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      loading={deleting === font.id}
                      disabled={deleting !== undefined}
                      aria-label={t('appearance.deleteFontLabel', { name: font.name })}
                      title={t('appearance.deleteFontLabel', { name: font.name })}
                      onClick={() => void deleteFont(font)}
                    >
                      <OperatorIcon icon={TrashSimpleIcon} size={16} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            ) : <Text size="sm" c="dimmed">{t('appearance.noImportedFonts')}</Text>}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
