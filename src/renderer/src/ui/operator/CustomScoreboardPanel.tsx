import {
  Button, ColorInput, FileInput, Group, NumberInput, Paper,
  Select, SimpleGrid, Stack, Switch, Text, TextInput, Title
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  customScoreboardRegion,
  customScoreboardRegionBounds,
  customScoreboardRegionIds,
  withCustomScoreboardRegion,
  type CustomScoreboard,
  type CustomScoreboardRegionId
} from '@shared/customScoreboards';
import type { SelectedSetState } from '@shared/models';
import { api } from '../../api';
import { CustomScoreboardCanvas } from '../CustomScoreboardCanvas';
import './customScoreboardPanel.css';

type CustomScoreboardPanelProps = {
  activeSet?: SelectedSetState;
  activeScoreboardId?: string;
  onSelect(scoreboardId?: string, revision?: string): void;
  onMessage(message: string): void;
};

export function CustomScoreboardPanel({
  activeSet, activeScoreboardId, onSelect, onMessage
}: CustomScoreboardPanelProps) {
  const { t } = useTranslation('operator');
  const [scoreboards, setScoreboards] = useState<CustomScoreboard[]>([]);
  const [draft, setDraft] = useState<CustomScoreboard>();
  const [frameUrl, setFrameUrl] = useState<string>();
  const [logoUrl, setLogoUrl] = useState<string>();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [regionId, setRegionId] = useState<CustomScoreboardRegionId>('playerOneName');
  const [working, setWorking] = useState(false);

  async function reload(preferredId?: string) {
    const response = await api.customScoreboards();
    setScoreboards(response.scoreboards);
    const selected = response.scoreboards.find((item) => item.id === (preferredId ?? activeScoreboardId))
      ?? response.scoreboards[0];
    setDraft(selected);
  }

  useEffect(() => {
    void reload().catch(() => onMessage(t('customScoreboard.loadFailed')));
  }, []);

  useEffect(() => {
    let active = true;
    if (!draft) {
      setFrameUrl(undefined);
      return () => { active = false; };
    }
    void api.customScoreboardFrameUrl(draft).then(
      (url) => { if (active) setFrameUrl(url); },
      () => {
        if (!active) return;
        setFrameUrl(undefined);
        onMessage(t('customScoreboard.imageLoadFailed'));
      }
    );
    return () => { active = false; };
  }, [draft?.frameRevision, draft?.id]);

  useEffect(() => {
    let active = true;
    const logoId = activeSet?.broadcast?.logoAssetId;
    if (!logoId) {
      setLogoUrl(undefined);
      return () => { active = false; };
    }
    void api.logoAssetUrl(logoId).then(
      (url) => { if (active) setLogoUrl(url); },
      () => { if (active) setLogoUrl(undefined); }
    );
    return () => { active = false; };
  }, [activeSet?.broadcast?.logoAssetId]);

  const selectedRegion = draft ? customScoreboardRegion(draft, regionId) : undefined;
  const selectedBounds = customScoreboardRegionBounds(regionId);
  const regionOptions = useMemo(() => customScoreboardRegionIds.map((value) => ({
    value,
    label: t(`customScoreboard.regions.${value}`)
  })), [t]);

  async function importScoreboard() {
    if (!file || !name.trim()) {
      onMessage(t('customScoreboard.chooseFileAndName'));
      return;
    }
    setWorking(true);
    try {
      const imported = await api.importCustomScoreboard(name.trim(), file);
      await reload(imported.id);
      onSelect(imported.id, imported.frameRevision);
      setFile(null);
      setName('');
      onMessage(t('customScoreboard.imported'));
    } catch (error) {
      onMessage(error instanceof Error ? error.message : t('customScoreboard.importFailed'));
    } finally {
      setWorking(false);
    }
  }

  async function saveScoreboard() {
    if (!draft) return;
    setWorking(true);
    try {
      const saved = await api.updateCustomScoreboard({
        ...draft,
        frameRevision: new Date().toISOString()
      });
      setScoreboards((current) => current.map((item) => item.id === saved.id ? saved : item));
      setDraft(saved);
      if (activeScoreboardId === saved.id) onSelect(saved.id, saved.frameRevision);
      onMessage(t('customScoreboard.saved'));
    } catch (error) {
      onMessage(error instanceof Error ? error.message : t('customScoreboard.saveFailed'));
    } finally {
      setWorking(false);
    }
  }

  async function removeScoreboard() {
    if (!draft || !window.confirm(t('customScoreboard.deleteConfirm', { name: draft.name }))) return;
    setWorking(true);
    try {
      await api.deleteCustomScoreboard(draft.id);
      if (activeScoreboardId === draft.id) onSelect(undefined);
      await reload();
      onMessage(t('customScoreboard.deleted'));
    } catch (error) {
      onMessage(error instanceof Error ? error.message : t('customScoreboard.deleteFailed'));
    } finally {
      setWorking(false);
    }
  }

  function patchRegion(patch: Partial<NonNullable<typeof selectedRegion>>) {
    if (!draft || !selectedRegion) return;
    const next = { ...selectedRegion, ...patch };
    next.width = Math.max(20, Math.min(selectedBounds.width, next.width));
    next.height = Math.max(20, Math.min(selectedBounds.height, next.height));
    next.x = Math.max(selectedBounds.x, Math.min(
      selectedBounds.x + selectedBounds.width - next.width,
      next.x
    ));
    next.y = Math.max(selectedBounds.y, Math.min(
      selectedBounds.y + selectedBounds.height - next.height,
      next.y
    ));
    setDraft(withCustomScoreboardRegion(draft, regionId, next));
  }

  function numberValue(value: string | number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
  }

  return (
    <Paper className="panel custom-scoreboard-workspace" p="lg" radius="lg" withBorder>
      <Stack gap="lg">
        <div>
          <Title order={2} size="h4">{t('customScoreboard.title')}</Title>
          <Text c="dimmed" size="sm">{t('customScoreboard.description')}</Text>
        </div>

        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <TextInput
            label={t('customScoreboard.name')}
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <FileInput
            label={t('customScoreboard.image')}
            description={t('customScoreboard.imageHelp')}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            accept="image/png"
            value={file}
            clearable
            onChange={setFile}
          />
          <Button
            className="custom-scoreboard-import-button"
            loading={working}
            disabled={!file || !name.trim()}
            onClick={() => void importScoreboard()}
          >
            {t('customScoreboard.import')}
          </Button>
        </SimpleGrid>

        <Select
          label={t('customScoreboard.savedScoreboards')}
          placeholder={t('customScoreboard.none')}
          clearable
          searchable
          value={draft?.id ?? null}
          data={scoreboards.map((item) => ({ value: item.id, label: item.name }))}
          onChange={(value) => {
            setDraft(scoreboards.find((item) => item.id === value));
            if (!value) onSelect(undefined);
          }}
        />

        {draft && frameUrl && (
          <>
            <div className="custom-scoreboard-preview-shell">
              <CustomScoreboardCanvas
                scoreboard={draft}
                frameUrl={frameUrl}
                selectedSet={activeSet}
                logoUrl={logoUrl}
                editingRegion={regionId}
                editorLabel={t('customScoreboard.keyboardCanvas')}
                onMoveRegion={(region, x, y) => {
                  if (region === regionId) patchRegion({ x, y });
                }}
              />
            </div>
            <Text c="dimmed" size="xs">{t('customScoreboard.dragHelp')}</Text>

            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <TextInput
                label={t('customScoreboard.savedName')}
                value={draft.name}
                maxLength={60}
                onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
              />
              <Select
                label={t('customScoreboard.adjustRegion')}
                value={regionId}
                data={regionOptions}
                onChange={(value) => value && setRegionId(value as CustomScoreboardRegionId)}
              />
            </SimpleGrid>

            {selectedRegion && (
              <SimpleGrid cols={{ base: 2, md: 5 }}>
                {(['x', 'y', 'width', 'height'] as const).map((field) => (
                  <NumberInput
                    key={field}
                    label={field.toUpperCase()}
                    min={field === 'width' || field === 'height' ? 20
                      : field === 'x' ? selectedBounds.x : selectedBounds.y}
                    max={field === 'x' ? selectedBounds.x + selectedBounds.width - selectedRegion.width
                      : field === 'y' ? selectedBounds.y + selectedBounds.height - selectedRegion.height
                        : field === 'width' ? selectedBounds.x + selectedBounds.width - selectedRegion.x
                          : selectedBounds.y + selectedBounds.height - selectedRegion.y}
                    value={selectedRegion[field]}
                    onChange={(value) => {
                      const next = numberValue(value);
                      if (next !== undefined) patchRegion({ [field]: next });
                    }}
                  />
                ))}
                <Select
                  label={t('customScoreboard.alignment')}
                  value={selectedRegion.align}
                  data={(['left', 'center', 'right'] as const).map((value) => ({
                    value, label: t(`customScoreboard.align.${value}`)
                  }))}
                  onChange={(value) => value && patchRegion({ align: value as 'left' | 'center' | 'right' })}
                />
              </SimpleGrid>
            )}

            <SimpleGrid cols={{ base: 2, md: 3 }}>
              {(['flags', 'sponsors', 'xHandles', 'pronouns', 'seeds', 'round', 'tournamentLogo', 'bottomRails'] as const).map((field) => (
                <Switch
                  key={field}
                  label={t(`customScoreboard.visibility.${field}`)}
                  checked={draft.visibility[field]}
                  onChange={(event) => setDraft({
                    ...draft,
                    visibility: { ...draft.visibility, [field]: event.currentTarget.checked }
                  })}
                />
              ))}
            </SimpleGrid>

            <SimpleGrid cols={{ base: 2, md: 6 }}>
              <ColorInput
                label={t('customScoreboard.textColor')}
                value={draft.typography.textColor}
                onChange={(textColor) => setDraft({ ...draft, typography: { ...draft.typography, textColor } })}
              />
              <Select
                label={t('customScoreboard.outlineLabel')}
                value={draft.typography.outline}
                data={(['none', 'soft', 'strong'] as const).map((value) => ({ value, label: t(`customScoreboard.outline.${value}`) }))}
                allowDeselect={false}
                onChange={(outline) => outline && setDraft({
                  ...draft,
                  typography: { ...draft.typography, outline: outline as 'none' | 'soft' | 'strong' }
                })}
              />
              {(['nameSize', 'metaSize', 'scoreSize', 'contextSize'] as const).map((field) => (
                <NumberInput
                  key={field}
                  label={t(`customScoreboard.typography.${field}`)}
                  min={field === 'scoreSize' ? 16 : field === 'nameSize' ? 12 : 10}
                  max={field === 'scoreSize' ? 120 : field === 'nameSize' ? 96 : 64}
                  value={draft.typography[field]}
                  onChange={(value) => {
                    const next = numberValue(value);
                    if (next !== undefined) setDraft({
                      ...draft,
                      typography: { ...draft.typography, [field]: next }
                    });
                  }}
                />
              ))}
            </SimpleGrid>

            <Group>
              <Button loading={working} onClick={() => void saveScoreboard()}>{t('customScoreboard.save')}</Button>
              <Button
                variant={activeScoreboardId === draft.id ? 'light' : 'filled'}
                color={activeScoreboardId === draft.id ? 'green' : undefined}
                onClick={() => onSelect(draft.id, draft.frameRevision)}
              >
                {activeScoreboardId === draft.id ? t('customScoreboard.active') : t('customScoreboard.useInObs')}
              </Button>
              <Button variant="default" onClick={() => onSelect(undefined)}>{t('customScoreboard.useAutomatic')}</Button>
              <Button variant="subtle" color="red" loading={working} onClick={() => void removeScoreboard()}>
                {t('customScoreboard.delete')}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}
