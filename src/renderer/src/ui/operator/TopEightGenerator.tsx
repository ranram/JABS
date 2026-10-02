import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  ColorInput,
  Group,
  Loader,
  MultiSelect,
  Overlay,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import { broadcastSurfaceSpecs } from '@shared/broadcastCompositions';
import { gameIdForStartggVideogame, type GameProfile } from '@shared/gameProfiles';
import { gameAssetCatalogSlug } from '@shared/gameAssetCatalog';
import { characterTeamSelection, maxCharactersForGame, playerCharacters } from '@shared/characterTeams';

import type { CountryOption, LogoAsset } from '@shared/models';
import type { MediaLayerKind, MediaTransform } from '@shared/mediaPlacement';
import { MediaFoldersAccordion } from './MediaFoldersAccordion';
import { normalizeEventSlug } from '@shared/startgg';
import {
  hasConventionalTopEightPlacements,
  topEightStyleIds,
  topEightMediaModeIds,
  validateTopEightDraft,
  type TopEightMediaMode,
  type TopEightStyleId
} from '@shared/topEight';
import { api } from '../../api';
import { sortByLabel } from './operatorUtils';
import { DisplayFlagSelect } from './DisplayFlagSelect';
import { CharacterOutfitSelect } from './CharacterOutfitSelect';
import {
  TopEightCanvas,
  topEightTrustedText
} from './TopEightCanvas';
import { useTopEightMedia } from './useTopEightMedia';
import { useLogoAssetUrl } from '../../hooks/useLogoAssetUrl';
import type { TopEightDraftController } from './useTopEightDraft';
import { useGeneratorWarningToast } from './useGeneratorWarningToast';
import { exportGraphicAsPng, safeGraphicFilename } from './exportGraphic';
import { GraphicBackgroundControls } from './GraphicBackgroundControls';
import { BufferedTextInput } from './BufferedTextInput';
import { MediaControlHint } from './MediaControlHint';
import { TopEightEventDetails } from './TopEightEventDetails';
import './generatorFonts.css';
import './adjustableMedia.css';
import './topEight.css';

type TopEightGeneratorProps = {
  controller: TopEightDraftController;
  profiles: GameProfile[];
  selectedEventId?: string;
  moderationRevision: number;
  logos: LogoAsset[];
  assetCatalogRevision: number;
  assetCatalogSlug?: string;
  countries: CountryOption[];
};

const noMediaSelection = '__none__';

function normalizeTopEightXHandle(value: string): string | undefined {
  const normalized = value.trim().replace(/^@+/, '').trim();
  return normalized || undefined;
}

export function TopEightGenerator({
  controller,
  profiles,
  selectedEventId,
  moderationRevision,
  logos,
  assetCatalogRevision,
  assetCatalogSlug,
  countries
}: TopEightGeneratorProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const { draft } = controller;
  const resolvedAssetCatalogSlug = assetCatalogSlug ?? draft.assetCatalogSlug;
  const profile = profiles.find((candidate) => candidate.id === draft.gameId) ?? profiles[0];
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(() => sortByLabel(profiles, (profile) => profile.styleName, locale), [profiles, locale]);
  const {
    previewDraft, media, availableCharacterNames, characterAssets, mediaWarning
  } = useTopEightMedia(draft, assetCatalogRevision);
  const canvasDraft = useMemo(() => ({
    ...previewDraft,
    background: draft.background
  }), [draft.background, previewDraft]);
  useGeneratorWarningToast(
    'jabs-top-eight-generator-warning',
    mediaWarning,
    String(t('operator:notices.actionFailed'))
  );
  const characters = useMemo(() => sortByLabel(
    [...new Set([
      ...charactersForAssetCatalog(draft.assetCatalogSlug),
      ...availableCharacterNames
    ])],
    (character) => character,
    i18n.resolvedLanguage ?? i18n.language
  ), [availableCharacterNames, draft.assetCatalogSlug, i18n.language, i18n.resolvedLanguage]);
  const visibleMedia = useMemo(() => media.map((entrantMedia) => ({
    characterUrl: previewDraft.mediaMode === 'character' ? entrantMedia.characterUrl : undefined,
    playerPhotoUrl: previewDraft.mediaMode === 'photo' ? entrantMedia.playerPhotoUrl : undefined,
    sponsorLogoUrl: entrantMedia.sponsorLogoUrl,
    characterPortraits: previewDraft.mediaMode === 'character' ? entrantMedia.characterPortraits : undefined
  })), [media, previewDraft.mediaMode]);
  const stylingProfile = profiles.find((candidate) => candidate.id === previewDraft.stylingGameId) ?? profile;
  const validation = validateTopEightDraft(draft);
  const previewCurrent = previewDraft === draft;
  const logoUrl = useLogoAssetUrl(draft.logoAssetId);
  const sortedLogos = useMemo(() => sortByLabel(
    logos,
    (logo) => logo.label,
    i18n.resolvedLanguage ?? i18n.language
  ), [i18n.language, i18n.resolvedLanguage, logos]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsMessage, setStandingsMessage] = useState<string>();
  const [loadUrl, setLoadUrl] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedEntrant, setSelectedEntrant] = useState<number>();
  const canvasRef = useRef<HTMLElement>(null);
  const automaticStandingsRequest = useRef<{
    eventId: string;
    moderationRevision: number;
    promise: ReturnType<typeof api.eventStandings>;
  } | undefined>(undefined);
  const placementOptions = useMemo(() => visibleMedia.flatMap((entrantMedia, index) => {
    const hasMedia = draft.mediaMode === 'character'
      ? Boolean(entrantMedia.characterUrl)
      : Boolean(entrantMedia.playerPhotoUrl);
    return hasMedia ? [{ value: String(index), label: draft.entrants[index]?.name ?? `Player ${index + 1}` }] : [];
  }), [draft.entrants, draft.mediaMode, visibleMedia]);
  useEffect(() => {
    if (selectedEntrant !== undefined && placementOptions.some((option) => option.value === String(selectedEntrant))) return;
    setSelectedEntrant(undefined);
  }, [placementOptions, selectedEntrant]);
  useEffect(() => {
    setSelectedEntrant(undefined);
  }, [draft.gameId, draft.stylingGameId, draft.style, draft.mediaMode, ...draft.entrants.map(({ name }) => name)]);
  useEffect(() => {
    if (!selectedEventId) return;
    if (
      automaticStandingsRequest.current?.eventId !== selectedEventId
      || automaticStandingsRequest.current?.moderationRevision !== moderationRevision
    ) {
      automaticStandingsRequest.current = {
        eventId: selectedEventId,
        moderationRevision,
        promise: api.eventStandings(selectedEventId)
      };
    }
    let active = true;
    setStandingsLoading(true);
    setStandingsMessage(undefined);
    void automaticStandingsRequest.current.promise.then((result) => {
      if (active) importFinalStandings(result);
    }).catch((error) => {
      if (active) setStandingsMessage(error instanceof Error ? error.message : t('operator:topEight.standingsFailed'));
    }).finally(() => {
      if (active) setStandingsLoading(false);
    });
    return () => { active = false; };
  }, [selectedEventId, moderationRevision]);

  function resetSelectedPlacement() {
    if (selectedEntrant === undefined) return;
    controller.resetMediaTransform(selectedEntrant, draft.mediaMode);
    window.requestAnimationFrame(() => {
      canvasRef.current?.querySelector<HTMLElement>('.keyboard-adjustable-media.is-selected')?.focus({ preventScroll: true });
    });
  }

  async function loadFinalStandingsUrl() {
    setStandingsLoading(true);
    setStandingsMessage(undefined);
    try {
      const result = await api.eventStandingsBySlug(normalizeEventSlug(loadUrl));
      importFinalStandings(result);
    } catch (error) {
      setStandingsMessage(error instanceof Error ? error.message : t('operator:topEight.standingsFailed'));
    } finally {
      setStandingsLoading(false);
    }
  }

  function importFinalStandings(result: Awaited<ReturnType<typeof api.eventStandings>>) {
    if (!result.finalized || result.standings.length !== 8) {
      setStandingsMessage(t('operator:topEight.standingsNotFinal'));
      return;
    }
    if (!hasConventionalTopEightPlacements(result.standings)) {
      setStandingsMessage(t('operator:topEight.standingsNotConventional'));
      return;
    }
    const detectedGame = result.eventGameName
      ? gameIdForStartggVideogame({ id: '', name: result.eventGameName })
      : undefined;
    controller.setGameContext(detectedGame, result.eventGameName);
    const detectedAssetSlug = detectedGame ?? gameAssetCatalogSlug({ name: result.eventGameName });
    if (detectedAssetSlug) controller.setAssetCatalogSlug(detectedAssetSlug);
    controller.useFinalStandings(result);
    setSelectedEntrant(undefined);
    setStandingsMessage(t('operator:topEight.standingsLoaded', { event: result.eventName }));
  }

  async function downloadPng() {
    if (!canvasRef.current || validation || !previewCurrent) return;
    setExporting(true);
    try {
      await exportGraphicAsPng(canvasRef.current, {
        ...broadcastSurfaceSpecs['top-eight'].canvas,
        filename: safeGraphicFilename(draft.tournamentName, 'top-8'),
        trustedText: topEightTrustedText(previewDraft)
      });
      notifications.show({
        title: t('operator:notices.done'),
        message: t('operator:topEight.downloaded'),
        color: 'green',
        autoClose: 6_000,
        withCloseButton: true
      });
    } catch (error) {
      notifications.show({
        title: t('operator:notices.actionFailed'),
        message: error instanceof Error ? error.message : t('operator:topEight.downloadFailed'),
        color: 'red',
        autoClose: false,
        withCloseButton: true
      });
    } finally {
      setExporting(false);
    }
  }

  if (!profile) return null;
  return (
    <Stack gap="md">
      <Paper className="panel top8-generator-controls" p="lg" radius="lg" withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={2} size="h4">{t('operator:workspaces.generators.topEight.title')}</Title>
            <Text c="dimmed" size="sm">{t('operator:topEight.description')}</Text>
          </div>
          <Badge color={validation ? 'yellow' : 'green'} variant="light">
            {validation ? t('operator:topEight.draft') : t('operator:topEight.ready')}
          </Badge>
        </Group>

        <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
          <Select
            label={t('operator:workspaces.styling')}
            value={draft.stylingGameId}
            searchable
            data={sortedProfiles.map((candidate) => ({ value: candidate.id, label: candidate.styleName }))}
            onChange={(value) => {
              if (value) controller.setStyling(value as typeof draft.stylingGameId);
              setSelectedEntrant(undefined);
            }}
          />
          <Select
            label={t('operator:topEight.tournamentLogo')}
            value={draft.logoAssetId ?? null}
            placeholder={t('operator:topEight.noLogo')}
            searchable
            clearable
            data={sortedLogos.map((logo) => ({ value: logo.id, label: logo.label }))}
            onChange={(value) => controller.setLogo(value ?? undefined)}
          />
          <div>
            <Text fw={700} size="sm" mb={5}>{t('operator:topEight.mediaMode')}</Text>
            <SegmentedControl
              fullWidth
              value={draft.mediaMode}
              data={topEightMediaModeIds.map((mode) => ({
                value: mode,
                label: t(`operator:topEight.mediaModes.${mode}`)
              }))}
              onChange={(value) => {
                controller.setMediaMode(value as TopEightMediaMode);
                setSelectedEntrant(undefined);
              }}
            />
          </div>
          <div>
            <Text fw={700} size="sm" mb={5}>{t('operator:topEight.style')}</Text>
            <SegmentedControl
              className="top8-style-control"
              fullWidth
              value={draft.style}
              data={topEightStyleIds.map((style) => ({
                value: style,
                label: t(`operator:topEight.styles.${style}`)
              }))}
              onChange={(value) => {
                controller.setStyle(value as TopEightStyleId);
                setSelectedEntrant(undefined);
              }}
            />
          </div>
        </SimpleGrid>
        <SimpleGrid type="container" cols={{ base: 1, '36rem': 3 }} mt="md">
          <BufferedTextInput
            label={t('operator:topEight.tournament')}
            value={draft.tournamentName}
            onCommit={controller.setTournamentName}
          />
          <BufferedTextInput
            label={t('operator:topEight.headline')}
            value={draft.headline}
            onCommit={controller.setHeadline}
          />
          <ColorInput
            label={t('operator:topEight.headlineColor')}
            value={draft.headlineColor}
            onChange={controller.setHeadlineColor}
            format="hex"
          />
        </SimpleGrid>

        <GraphicBackgroundControls value={draft.background} onChange={controller.setBackground} />

        <Box mt="md">
          <TopEightEventDetails
            controller={controller}
            loadUrl={loadUrl}
            onLoadUrlChange={setLoadUrl}
            onLoad={() => void loadFinalStandingsUrl()}
            loading={standingsLoading}
          />
        </Box>

        <Group mt="md" justify="flex-end" align="center">
          <Text size="xs" c="dimmed">
            {t('operator:topEight.assetsMatched', { count: availableCharacterNames.length })}
          </Text>
        </Group>
        <Box mt="xs">
          <MediaFoldersAccordion gameAssetSubpath={`${resolvedAssetCatalogSlug}/characters`} />
        </Box>
        {standingsMessage && <Text size="sm" mt="xs">{standingsMessage}</Text>}
        {validation && (
          <Text size="sm" c="yellow" mt="sm">
            {t(`operator:topEight.validation.${validation}`)}
          </Text>
        )}
      </Paper>

      <Paper className="panel top8-preview-panel" p="md" radius="lg" pos="relative" withBorder>
        {exporting && (
          <Overlay color="#080a10" backgroundOpacity={1} zIndex={20} center>
            <Center>
              <Stack align="center" gap="xs">
                <Loader color="yellow" />
                <Text fw={800}>{t('operator:topEight.nowDownloading')}</Text>
              </Stack>
            </Center>
          </Overlay>
        )}
        <Group justify="space-between" mb="sm">
          <Text fw={800}>{t('operator:topEight.preview')}</Text>
          <Button
            size="compact-sm"
            disabled={Boolean(validation) || !previewCurrent || exporting}
            loading={exporting}
            onClick={() => void downloadPng()}
          >
            {t('operator:topEight.downloadPng')}
          </Button>
        </Group>
        <Text c="dimmed" size="xs" mb="sm">
          {t('operator:topEight.previewQuality')}
        </Text>
        {placementOptions.length > 0 && (
          <Stack gap="xs" mb="md">
            <SimpleGrid type="container" cols={{ base: 1, '34rem': 2 }}>
              <Select
                label={t('operator:topEight.adjustLayer')}
                value={selectedEntrant === undefined ? noMediaSelection : String(selectedEntrant)}
                placeholder={t('common:actions.select')}
                clearable
                data={[
                  { value: noMediaSelection, label: t('common:actions.select') },
                  ...placementOptions
                ]}
                onChange={(value) => setSelectedEntrant(
                  !value || value === noMediaSelection ? undefined : Number(value)
                )}
              />
              <Group align="flex-end">
                <Button fullWidth variant="default" disabled={selectedEntrant === undefined} onClick={resetSelectedPlacement}>
                  {t('operator:topEight.resetPlacement')}
                </Button>
              </Group>
            </SimpleGrid>
            <MediaControlHint />
          </Stack>
        )}
        <TopEightCanvas
          canvasRef={canvasRef}
          draft={canvasDraft}
          stylingProfile={stylingProfile}
          media={visibleMedia}
          logoUrl={logoUrl}
          placements={controller.mediaPlacements}
          selectedEntrant={selectedEntrant}
          onSelectEntrant={setSelectedEntrant}
          onPlacementChange={(index: number, layer: MediaLayerKind, transform: MediaTransform) => (
            controller.setMediaTransform(index, layer, transform)
          )}
        />
      </Paper>

      <Paper className="panel top8-entrants-panel" p="lg" radius="lg" withBorder>
        <Title order={2} size="h4" mb="md">{t('operator:topEight.placements')}</Title>
        <SimpleGrid type="container" cols={{ base: 1, '42rem': 2 }}>
          {draft.entrants.map((entrant, index) => (
            <Paper key={`${entrant.placement}-${index}`} className="top8-entrant-editor" p="sm" radius="md" withBorder>
              <Group gap="xs" mb="sm">
                <Badge variant="filled">#{entrant.placement}</Badge>
                <Text fw={800}>{t('operator:topEight.placement', { count: entrant.placement })}</Text>
              </Group>
              <div className="player-field-row">
                <BufferedTextInput
                  label={t('operator:topEight.playerTag')}
                  value={entrant.name}
                  onCommit={(name) => controller.setEntrant(index, { name })}
                />
                <BufferedTextInput
                  label={t('operator:topEight.sponsor')}
                  value={entrant.sponsor ?? ''}
                  onCommit={(sponsor) => controller.setEntrant(index, {
                    sponsor: sponsor || undefined
                  })}
                />
              </div>
              <div className="player-field-row">
                <MultiSelect
                  label={t('operator:editor.characters')}
                  value={playerCharacters(entrant)}
                  placeholder={t('common:actions.select')}
                  searchable
                  clearable
                  maxValues={maxCharactersForGame(draft.gameId)}
                  data={characters.map((character) => ({ value: character, label: character }))}
                  onChange={(values) => controller.setEntrant(
                    index,
                    characterTeamSelection(values, entrant)
                  )}
                />
                <CharacterOutfitSelect
                  subject={entrant}
                  assets={characterAssets}
                  onChange={(characterAssetId) => controller.setEntrant(index, {
                    characterAssetId
                  })}
                />
              </div>
              <div className="player-field-row">
                <DisplayFlagSelect
                  label={t('operator:topEight.displayFlag')}
                  placeholder={t('common:actions.select')}
                  countries={countries}
                  country={entrant.country}
                  displayFlag={entrant.displayFlag}
                  onChange={(selection) => controller.setEntrant(index, selection)}
                />
                <BufferedTextInput
                  label={t('operator:topEight.xHandle')}
                  value={entrant.xHandle ?? ''}
                  onCommit={(xHandle) => controller.setEntrant(index, {
                    xHandle: normalizeTopEightXHandle(xHandle)
                  })}
                />
              </div>
            </Paper>
          ))}
        </SimpleGrid>
      </Paper>
    </Stack>
  );
}
