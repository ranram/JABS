import { localizedNativeError } from '../../i18n/nativeErrors';
import { HintedButton } from '../operator/HintedButton';
import { DestructiveButton } from '../DestructiveButton';
import { useMemo, useState } from 'react';
import {
  Accordion,
  Badge,
  Button,
  FileInput,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SelectedSetState } from '@shared/models';
import { stingerLimits, type StingerCue, type StingerKind, type StingerSettings } from '@shared/stingers';
import { api } from '../../api';
import { OverlaySourceField } from '../operator/OverlaySourceField';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { useStingers } from '../../hooks/useStingers';
import { announcementPresentation } from '../announcementPresentation';
import { StingerFramingPreview, StingerStage } from './StingerStage';
import { PanelHeader } from '../PanelHeader';
import './stingersPanel.css';

export function StingersPanel({ activeSet, localBaseUrl }: { activeSet?: SelectedSetState; localBaseUrl?: string }) {
  const { t } = useTranslation('operator');
  const live = useStingers();
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<StingerCue>();
  const [previewSide, setPreviewSide] = useState('one');
  const {
    state: settings,
    saving,
    update,
    reload,
    loadError
  } = useSettingsDraft({
    load: () => api.stingers().then((value) => value.settings),
    save: (value: StingerSettings) => api.updateStingers(value).then((value) => value.settings),
    onError: (error) => setMessage(error instanceof Error ? error.message : t('stingers.failed'))
  });
  const previewSet = useMemo(
    () =>
      activeSet
        ? {
            ...activeSet,
            bestOf: 3,
            matchFormat: 'best-of' as const,
            state: undefined,
            playerOne: { ...activeSet.playerOne, score: previewSide === 'one' ? 2 : 0 },
            playerTwo: { ...activeSet.playerTwo, score: previewSide === 'two' ? 2 : 0 }
          }
        : undefined,
    [activeSet, previewSide]
  );
  const winner = activeSet ? announcementPresentation(activeSet)?.winner : undefined;
  const busy = saving || working;

  async function run(action: () => Promise<unknown>) {
    setMessage(undefined);
    setWorking(true);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('stingers.failed'));
    } finally {
      setWorking(false);
    }
  }
  async function importVideo(kind: StingerKind, file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.webm')) {
      setMessage(t('stingers.webmOnly'));
      return;
    }
    if (file.size > stingerLimits.videoBytes) {
      setMessage(t('stingers.tooLarge'));
      return;
    }
    setPreview(undefined);
    await run(async () => {
      await api.importStinger(kind, file);
      await reload();
    });
  }
  function startPreview(kind: StingerKind) {
    if (!settings) return;
    setPreview({
      id: crypto.randomUUID(),
      kind,
      settings,
      selectedSet: kind === 'winner' ? previewSet : undefined,
      claimed: false,
      expiresAt: Date.now() + stingerLimits.cueLifetimeMs
    });
  }

  if (!settings)
    return (
      <Paper p="md" withBorder>
        <Stack>
          <Text>{loadError ? t('stingers.failed') : t('stingers.loading')}</Text>
          {Boolean(loadError) && <Button onClick={() => void reload()}>{t('stingers.retry')}</Button>}
        </Stack>
      </Paper>
    );

  return (
    <Paper className="panel stingers-panel" data-tutorial="stingers" p="md" radius="lg" withBorder>
      <Stack gap="md">
        <PanelHeader title={t('workspaces.stingers')}>
          <Group gap="xs" wrap="nowrap">
            <Button
              variant="default"
              loading={working}
              disabled={saving}
              onClick={() => void run(live.reconnectSources)}
            >
              {t('stingers.reconnect')}
            </Button>
            <Button color="red" variant="light" onClick={() => void run(api.stopStinger)}>
              {t('stingers.stopBroadcast')}
            </Button>
            <Badge color={live.state?.readySources ? 'green' : 'gray'}>
              {t('stingers.readySources', { count: live.state?.readySources ?? 0 })}
            </Badge>
          </Group>
        </PanelHeader>
        <div>
          <Text size="sm" c="dimmed" mb="xs">
            {t('stingers.sourceHelp')} {t('stingers.audioHelp')}
          </Text>
          {localBaseUrl && <OverlaySourceField localBaseUrl={localBaseUrl} source="stingers" />}
        </div>
        {(message || live.error || live.state?.playbackError) && (
          <Text role="alert" c="red">
            {message ?? live.error ?? (live.state?.playbackError && localizedNativeError(live.state.playbackError))}
          </Text>
        )}
        <div className="stingers-workspace">
          <Stack gap="xs" className="stinger-controls">
            <Text size="xs" c="dimmed">
              {t('stingers.formats')}
            </Text>
            <div className="stinger-clip-list">
              {(['perfect', 'winner'] as const).map((kind) => {
                const clip = settings[kind];
                return (
                  <Paper className="operator-inset" key={kind} p="md" withBorder radius="md">
                    <Stack gap="md">
                      <Group justify="space-between" gap="xs">
                        <Title order={3} size="h5">
                          {t(`stingers.${kind}`)}
                        </Title>
                        {kind === 'winner' && (
                          <Badge
                            className="stinger-winner-status"
                            variant="light"
                            color={winner ? 'green' : 'gray'}
                            tt="none"
                          >
                            {winner ? t('stingers.currentWinner', { name: winner.name }) : t('stingers.noWinner')}
                          </Badge>
                        )}
                      </Group>
                      <FileInput
                        label={t('stingers.video')}
                        placeholder={clip.video?.name ?? t('stingers.chooseVideo')}
                        accept=".webm,video/webm"
                        value={null}
                        disabled={busy}
                        onChange={(file) => void importVideo(kind, file)}
                      />
                      <Switch
                        label={t('stingers.useDuration')}
                        checked={clip.durationSeconds !== undefined}
                        disabled={busy}
                        onChange={(event) =>
                          void update({
                            [kind]: { ...clip, durationSeconds: event.currentTarget.checked ? 8 : undefined }
                          })
                        }
                      />
                      {clip.durationSeconds !== undefined && (
                        <NumberInput
                          label={t('stingers.duration')}
                          min={0.5}
                          max={stingerLimits.durationSeconds}
                          step={0.5}
                          value={clip.durationSeconds}
                          disabled={busy}
                          onChange={(value) =>
                            typeof value === 'number' &&
                            void update({ [kind]: { ...clip, durationSeconds: value } }, 350)
                          }
                        />
                      )}
                      <Group grow preventGrowOverflow={false}>
                        <HintedButton
                          fullWidth
                          reason={
                            busy
                              ? t('editor.waitAction')
                              : !clip.video
                                ? t('stingers.chooseVideo')
                                : !activeSet
                                  ? t('workspaces.versusScreen.noSet')
                                  : undefined
                          }
                          variant="light"
                          disabled={busy || !clip.video || (kind === 'winner' && !activeSet)}
                          onClick={() => startPreview(kind)}
                        >
                          {t('stingers.preview')}
                        </HintedButton>
                        <HintedButton
                          fullWidth
                          reason={
                            busy
                              ? t('editor.waitAction')
                              : !clip.video
                                ? t('stingers.chooseVideo')
                                : !live.state?.readySources
                                  ? t('stingers.activateSource')
                                  : kind === 'winner' && !winner
                                    ? t('stingers.noWinner')
                                    : undefined
                          }
                          disabled={busy || !clip.video || !live.state?.readySources || (kind === 'winner' && !winner)}
                          onClick={() => void run(() => api.playStinger(kind))}
                        >
                          {t('stingers.playBroadcast')}
                        </HintedButton>
                        <DestructiveButton
                          disabled={busy || !clip.video}
                          onClick={() =>
                            void run(async () => {
                              setPreview(undefined);
                              await api.removeStinger(kind);
                              await reload();
                            })
                          }
                        >
                          {t('stingers.remove')}
                        </DestructiveButton>
                      </Group>
                      {kind === 'winner' && (
                        <Accordion variant="separated" radius="md">
                          <Accordion.Item value="playback">
                            <Accordion.Control>{t('stingers.playbackSettings')}</Accordion.Control>
                            <Accordion.Panel>
                              <Stack gap="md">
                                <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
                                  <NumberInput
                                    label={t('stingers.mediaDelay')}
                                    min={0}
                                    max={30}
                                    step={0.5}
                                    value={settings.mediaDelaySeconds}
                                    disabled={busy}
                                    onChange={(value) =>
                                      typeof value === 'number' && void update({ mediaDelaySeconds: value }, 350)
                                    }
                                  />
                                  <Select
                                    label={t('stingers.layer')}
                                    description={t('stingers.layerHelp')}
                                    inputWrapperOrder={['label', 'input', 'description', 'error']}
                                    value={settings.videoLayer}
                                    allowDeselect={false}
                                    disabled={busy}
                                    data={[
                                      { value: 'foreground', label: t('stingers.inFront') },
                                      { value: 'background', label: t('stingers.behind') }
                                    ]}
                                    onChange={(value) =>
                                      (value === 'background' || value === 'foreground') &&
                                      void update({ videoLayer: value })
                                    }
                                  />
                                </SimpleGrid>
                                <Switch
                                  label={t('stingers.automaticWinner')}
                                  description={t('stingers.automaticHelp')}
                                  checked={settings.automaticWinner}
                                  disabled={busy}
                                  onChange={(event) => void update({ automaticWinner: event.currentTarget.checked })}
                                />
                              </Stack>
                            </Accordion.Panel>
                          </Accordion.Item>
                        </Accordion>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </div>
          </Stack>
          <Stack gap="md" className="stinger-preview-controls">
            <Group justify="space-between">
              <Title order={3} size="h5">
                {t('stingers.framing')}
              </Title>
              <Group>
                <Select
                  aria-label={t('stingers.previewPlayer')}
                  w={180}
                  value={previewSide}
                  disabled={Boolean(preview)}
                  allowDeselect={false}
                  data={[
                    { value: 'one', label: activeSet?.playerOne.name ?? t('stingers.playerOne') },
                    { value: 'two', label: activeSet?.playerTwo.name ?? t('stingers.playerTwo') }
                  ]}
                  onChange={(value) => value && setPreviewSide(value)}
                />
                <Button variant="light" disabled={!preview} onClick={() => setPreview(undefined)}>
                  {t('stingers.stopPreview')}
                </Button>
              </Group>
            </Group>
            <Text size="sm" c="dimmed">
              {t('stingers.framingHelp')}
            </Text>
            <div className="stinger-panel-preview">
              {preview ? (
                <StingerStage
                  key={preview.id}
                  cue={preview}
                  muted
                  onFinish={(error) => {
                    setPreview((current) => (current?.id === preview.id ? undefined : current));
                    if (error) setMessage(t('stingers.playbackFailed'));
                  }}
                />
              ) : (
                <StingerFramingPreview
                  selectedSet={previewSet}
                  labels={[t('stingers.photo'), t('stingers.character'), t('stingers.name')]}
                />
              )}
            </div>
          </Stack>
        </div>
      </Stack>
    </Paper>
  );
}
