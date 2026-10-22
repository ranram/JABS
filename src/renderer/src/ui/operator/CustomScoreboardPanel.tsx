import { CustomScoreboardBroadcastExtras } from './CustomScoreboardBroadcastExtras';
import { DestructiveButton } from '../DestructiveButton';
import type { NoticeSink } from './operatorNotice';
import {
  Accordion,
  Badge,
  Button,
  ColorInput,
  FileInput,
  Fieldset,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  customScoreboardRegion,
  customScoreboardRegionIds,
  clampCustomScoreboardRegion,
  withCustomScoreboardRegion,
  mirrorCustomScoreboardRegion,
  defaultCustomScoreboardFont,
  type CustomScoreboard,
  type CustomScoreboardRegion,
  type CustomScoreboardRegionId
} from '@shared/customScoreboards';
import type { SelectedSetState } from '@shared/models';
import { api } from '../../api';
import { useLogoAssetUrl } from '../../hooks/useLogoAssetUrl';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { CustomScoreboardCanvas } from '../CustomScoreboardCanvas';
import { PanelHeader } from '../PanelHeader';
import { CustomScoreboardRegionControls } from '../customScoreboard/CustomScoreboardRegionControls';
import { ScoreboardFontSelect } from '../fonts/ScoreboardFontSelect';
import './customScoreboardPanel.css';
import { useCustomScoreboardDraft } from './useCustomScoreboardDraft';

type CustomScoreboardPanelProps = {
  onPatchBroadcast?(patch: Partial<NonNullable<SelectedSetState['broadcast']>>): void;
  activeSet?: SelectedSetState;
  activeScoreboardId?: string;
  onSelect(scoreboardId?: string, revision?: string): void;
  onMessage: NoticeSink;
};

const autosaveStatusColors = {
  saved: 'green',
  saving: 'blue',
  incomplete: 'yellow',
  error: 'red'
} as const;

export function CustomScoreboardPanel({
  onPatchBroadcast,
  activeSet,
  activeScoreboardId,
  onSelect,
  onMessage
}: CustomScoreboardPanelProps) {
  const { t } = useTranslation('operator');
  const catalogRevision = useCatalogRevision();
  const [scoreboards, setScoreboards] = useState<CustomScoreboard[]>([]);
  const [frameUrl, setFrameUrl] = useState<string>();
  const logoUrl = useLogoAssetUrl(activeSet?.broadcast?.logoAssetId);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [regionId, setRegionId] = useState<CustomScoreboardRegionId>('playerOneName');
  const [working, setWorking] = useState(false);
  const { draft, setDraft, select, status, saving, retry, flush, forget } = useCustomScoreboardDraft({
    onSaved(saved) {
      setScoreboards((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      if (activeScoreboardId === saved.id) onSelect(saved.id, saved.frameRevision);
    },
    onIdleSaved() {
      onMessage(t('customScoreboard.saved'), 'success');
    },
    onError(error) {
      onMessage(error instanceof Error ? error.message : t('customScoreboard.saveFailed'), 'error');
    }
  });

  async function reload(preferredId?: string) {
    const response = await api.customScoreboards();
    setScoreboards(response.scoreboards);
    const selected =
      response.scoreboards.find((item) => item.id === (preferredId ?? activeScoreboardId)) ?? response.scoreboards[0];
    select(selected);
  }

  useEffect(() => {
    void reload().catch(() => onMessage(t('customScoreboard.loadFailed'), 'error'));
  }, []);

  useEffect(() => {
    let active = true;
    if (!draft) {
      setFrameUrl(undefined);
      return () => {
        active = false;
      };
    }
    void api.customScoreboardFrameUrl(draft).then(
      (url) => {
        if (active) setFrameUrl(url);
      },
      () => {
        if (!active) return;
        setFrameUrl(undefined);
        onMessage(t('customScoreboard.imageLoadFailed'), 'error');
      }
    );
    return () => {
      active = false;
    };
  }, [draft?.frameRevision, draft?.id, catalogRevision]);

  const selectedRegion = draft ? customScoreboardRegion(draft, regionId) : undefined;
  const regionOptions = useMemo(
    () =>
      customScoreboardRegionIds.map((value) => ({
        value,
        label: t(`customScoreboard.regions.${value}`)
      })),
    [t]
  );

  async function importScoreboard() {
    if (!file || !name.trim()) {
      onMessage(t('customScoreboard.chooseFileAndName'), 'warning');
      return;
    }
    setWorking(true);
    try {
      await flush();
      const imported = await api.importCustomScoreboard(name.trim(), file);
      await reload(imported.id);
      onSelect(imported.id, imported.frameRevision);
      setFile(null);
      setName('');
      onMessage(t('customScoreboard.imported'), 'success');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : t('customScoreboard.importFailed'), 'error');
    } finally {
      setWorking(false);
    }
  }

  async function removeScoreboard() {
    if (!draft || !window.confirm(t('customScoreboard.deleteConfirm', { name: draft.name }))) return;
    setWorking(true);
    try {
      await flush();
      await api.deleteCustomScoreboard(draft.id);
      forget(draft.id);
      if (activeScoreboardId === draft.id) onSelect(undefined);
      await reload();
      onMessage(t('customScoreboard.deleted'), 'success');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : t('customScoreboard.deleteFailed'), 'error');
    } finally {
      setWorking(false);
    }
  }

  function patchRegion(patch: Partial<CustomScoreboardRegion>, id = regionId) {
    setDraft((current) => {
      if (!current) return current;
      const region = clampCustomScoreboardRegion(id, { ...customScoreboardRegion(current, id), ...patch });
      return withCustomScoreboardRegion(current, id, region);
    });
  }

  function numberValue(value: string | number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
  }

  return (
    <Paper className="panel custom-scoreboard-workspace" p="md" radius="lg" withBorder>
      <Fieldset disabled={working} variant="unstyled">
        <Stack gap="md">
          <PanelHeader title={t('customScoreboard.title')} description={t('customScoreboard.description')}>
            {draft && frameUrl && (
              <Badge color={autosaveStatusColors[status]} role="status">
                {t(`customScoreboard.autosave.${status}`)}
              </Badge>
            )}
          </PanelHeader>

          <div className="custom-scoreboard-library-controls">
            <Select
              label={t('customScoreboard.savedScoreboards')}
              placeholder={t('customScoreboard.none')}
              clearable
              searchable
              value={draft?.id ?? null}
              data={scoreboards.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => {
                select(scoreboards.find((item) => item.id === value));
                if (!value) onSelect(undefined);
              }}
            />

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
          </div>
          {draft && frameUrl && (
            <>
              <div className="custom-scoreboard-editor-layout">
                <div className="custom-scoreboard-field-controls">
                  <Stack gap="xs">
                    <Group grow preventGrowOverflow={false}>
                      {status === 'error' && (
                        <Button variant="light" onClick={retry}>
                          {t('customScoreboard.retry')}
                        </Button>
                      )}
                      <Button
                        variant={activeScoreboardId === draft.id ? 'light' : 'filled'}
                        color={activeScoreboardId === draft.id ? 'green' : undefined}
                        onClick={() => onSelect(draft.id, draft.frameRevision)}
                      >
                        {activeScoreboardId === draft.id
                          ? t('customScoreboard.active')
                          : t('customScoreboard.useInObs')}
                      </Button>
                      <Button variant="default" onClick={() => onSelect(undefined)}>
                        {t('customScoreboard.useAutomatic')}
                      </Button>
                      <DestructiveButton disabled={saving} loading={working} onClick={() => void removeScoreboard()}>
                        {t('customScoreboard.delete')}
                      </DestructiveButton>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t('customScoreboard.autosaveHelp')}
                    </Text>
                  </Stack>
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
                    <CustomScoreboardRegionControls
                      regionId={regionId}
                      region={selectedRegion}
                      onChange={patchRegion}
                      onMirror={() =>
                        setDraft((current) => (current ? mirrorCustomScoreboardRegion(current, regionId) : current))
                      }
                    />
                  )}
                  <CustomScoreboardBroadcastExtras
                    scoreboard={draft}
                    onChange={setDraft}
                    broadcast={activeSet?.broadcast}
                    onBroadcastChange={activeSet ? onPatchBroadcast : undefined}
                  />
                  <Accordion variant="contained" defaultValue="appearance">
                    <Accordion.Item className="operator-inset" value="appearance">
                      <Accordion.Control>{t('quickTools.presentation')}</Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="md">
                          <SimpleGrid cols={2}>
                            {(
                              ['flags', 'sponsors', 'xHandles', 'pronouns', 'seeds', 'round', 'tournamentLogo'] as const
                            ).map((field) => (
                              <Switch
                                key={field}
                                label={t(`customScoreboard.visibility.${field}`)}
                                checked={draft.visibility[field]}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    visibility: { ...draft.visibility, [field]: event.currentTarget.checked }
                                  })
                                }
                              />
                            ))}
                          </SimpleGrid>

                          <SimpleGrid cols={2}>
                            <ScoreboardFontSelect
                              label={t('customScoreboard.font')}
                              value={draft.typography.font ?? defaultCustomScoreboardFont}
                              onChange={(font) => {
                                if (font) setDraft({ ...draft, typography: { ...draft.typography, font } });
                              }}
                            />
                            <Select
                              label={t('customScoreboard.outlineLabel')}
                              value={draft.typography.outline}
                              data={(['none', 'soft', 'strong'] as const).map((value) => ({
                                value,
                                label: t(`customScoreboard.outline.${value}`)
                              }))}
                              allowDeselect={false}
                              onChange={(outline) =>
                                outline &&
                                setDraft({
                                  ...draft,
                                  typography: { ...draft.typography, outline: outline as 'none' | 'soft' | 'strong' }
                                })
                              }
                            />
                            <ColorInput
                              label={t('customScoreboard.textColor')}
                              value={draft.typography.textColor}
                              onChange={(textColor) =>
                                setDraft({ ...draft, typography: { ...draft.typography, textColor } })
                              }
                            />
                            <ColorInput
                              label={t('customScoreboard.sponsorColor')}
                              value={draft.typography.sponsorColor ?? draft.typography.textColor}
                              onChange={(sponsorColor) =>
                                setDraft({ ...draft, typography: { ...draft.typography, sponsorColor } })
                              }
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
                                  if (next !== undefined)
                                    setDraft({
                                      ...draft,
                                      typography: { ...draft.typography, [field]: next }
                                    });
                                }}
                              />
                            ))}
                          </SimpleGrid>
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                </div>
                <div className="custom-scoreboard-preview-column">
                  <div className="custom-scoreboard-preview-shell">
                    <CustomScoreboardCanvas
                      scoreboard={draft}
                      frameUrl={frameUrl}
                      selectedSet={activeSet}
                      logoUrl={logoUrl}
                      editingRegion={regionId}
                      editorLabel={t('customScoreboard.keyboardCanvas')}
                      onSelectRegion={working ? undefined : setRegionId}
                      onMoveRegion={working ? undefined : (region, x, y) => patchRegion({ x, y }, region)}
                    />
                  </div>
                  <Text c="dimmed" size="xs">
                    {t('customScoreboard.dragHelp')}
                  </Text>
                </div>
              </div>
            </>
          )}
        </Stack>
      </Fieldset>
    </Paper>
  );
}
