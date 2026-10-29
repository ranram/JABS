import { recordDiagnostic } from '../../diagnostics';
import { CharacterSelect } from './CharacterSelect';
import { GeneratorChoiceControl } from './GeneratorChoiceControl';
import { GeneratorNavigation } from './GeneratorNavigation';
import { PanelHeader } from '../PanelHeader';
import { TrophyIcon, SlidersHorizontalIcon, UsersIcon, MonitorIcon } from '../icons';
import { PlayerNameInput } from '../players/PlayerNameInput';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Center, ColorInput, Group, Loader, Overlay, Paper, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import { broadcastSurfaceSpecs } from '@shared/broadcastCompositions';
import { gameIdForStartggVideogame, type GameProfile } from '@shared/gameProfiles';
import { gameAssetCatalogSlug } from '@shared/gameAssetCatalog';
import { characterTeamSelection, maxCharactersForGame, playerCharacters } from '@shared/characterTeams';

import type { CountryOption, LogoAsset } from '@shared/models';
import type { MediaLayerKind, MediaTransform } from '@shared/mediaPlacement';
import { normalizeEventSlug } from '@shared/startgg';
import {
  hasConventionalTopEightPlacements,
  topEightStyleIds,
  topEightMediaModeIds,
  validateTopEightDraft
} from '@shared/topEight';
import { api } from '../../api';
import { sortByLabel } from './operatorUtils';
import { DisplayFlagSelect } from './DisplayFlagSelect';
import { CharacterOutfitSelect } from './CharacterOutfitSelect';
import { TopEightCanvas, topEightTrustedText } from './TopEightCanvas';
import { useTopEightMedia } from './useTopEightMedia';
import { useLogoAssetUrl } from '../../hooks/useLogoAssetUrl';
import type { TopEightDraftController } from './useTopEightDraft';
import { useGeneratorWarningToast } from './useGeneratorWarningToast';
import { exportGraphicAsPng, safeGraphicFilename } from './exportGraphic';
import { GraphicBackgroundControls } from './GraphicBackgroundControls';
import { BufferedTextInput } from './BufferedTextInput';
import { GeneratorMediaControls } from './GeneratorMediaControls';
import { TopEightEventDetails } from './TopEightEventDetails';
import './generatorFonts.css';
import './adjustableMedia.css';
import './topEight.css';

type TopEightGeneratorProps = {
  gameSelector?: ReactNode;
  gameContextReady?: boolean;
  controller: TopEightDraftController;
  profiles: GameProfile[];
  selectedEventId?: string;
  moderationRevision: number;
  logos: LogoAsset[];
  assetCatalogRevision: number;
  countries: CountryOption[];
};

function normalizeTopEightXHandle(value: string): string | undefined {
  const normalized = value.trim().replace(/^@+/, '').trim();
  return normalized || undefined;
}

export function TopEightGenerator({
  controller,
  gameSelector,
  gameContextReady = true,
  profiles,
  selectedEventId,
  moderationRevision,
  logos,
  assetCatalogRevision,
  countries
}: TopEightGeneratorProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const { draft } = controller;
  const profile = profiles.find((candidate) => candidate.id === draft.gameId) ?? profiles[0];
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.styleName, locale),
    [profiles, locale]
  );
  const {
    previewDraft,
    media,
    ready: mediaReady,
    refreshing: mediaRefreshing,
    availableCharacterNames,
    characterAssets,
    mediaWarning
  } = useTopEightMedia(draft, assetCatalogRevision);
  const canvasDraft = useMemo(
    () => ({
      ...previewDraft,
      background: draft.background
    }),
    [draft.background, previewDraft]
  );
  useGeneratorWarningToast(
    'jabs-top-eight-generator-warning',
    mediaWarning,
    String(t('operator:notices.actionFailed'))
  );
  const characters = useMemo(
    () =>
      sortByLabel(
        [...new Set([...charactersForAssetCatalog(draft.assetCatalogSlug), ...availableCharacterNames])],
        (character) => character,
        i18n.resolvedLanguage ?? i18n.language
      ),
    [availableCharacterNames, draft.assetCatalogSlug, i18n.language, i18n.resolvedLanguage]
  );
  const visibleMedia = useMemo(
    () =>
      media.map((entrantMedia) => ({
        characterUrl: previewDraft.mediaMode !== 'photo' ? entrantMedia.characterUrl : undefined,
        playerPhotoUrl: previewDraft.mediaMode !== 'character' ? entrantMedia.playerPhotoUrl : undefined,
        sponsorLogoUrl: entrantMedia.sponsorLogoUrl,
        characterPortraits: previewDraft.mediaMode !== 'photo' ? entrantMedia.characterPortraits : undefined
      })),
    [media, previewDraft.mediaMode]
  );
  const stylingProfile = profiles.find((candidate) => candidate.id === previewDraft.stylingGameId) ?? profile;
  const validation = validateTopEightDraft(draft);
  const previewCurrent = (mediaReady || mediaRefreshing) && previewDraft === draft;
  const logoUrl = useLogoAssetUrl(draft.logoAssetId);
  const sortedLogos = useMemo(
    () => sortByLabel(logos, (logo) => logo.label, i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage, logos]
  );
  const [automaticStandingsLoading, setAutomaticStandingsLoading] = useState(false);
  const [manualStandingsLoading, setManualStandingsLoading] = useState(false);
  const standingsLoading = automaticStandingsLoading || manualStandingsLoading;
  const manualStandingsRequest = useRef(0);
  const [standingsNotice, setStandingsNotice] = useState<{ text: string; imported?: boolean }>();
  const [loadUrl, setLoadUrl] = useState('');
  const [importRevision, setImportRevision] = useState(0);
  useEffect(() => {
    manualStandingsRequest.current += 1;
    setManualStandingsLoading(false);
    return () => {
      manualStandingsRequest.current += 1;
    };
  }, [selectedEventId, draft.assetCatalogSlug, moderationRevision]);
  const [exporting, setExporting] = useState(false);
  const { selectedLayer, setSelectedLayer } = controller;
  const sectionId = useId();
  const canvasRef = useRef<HTMLElement>(null);
  const automaticStandingsRequest = useRef<
    | {
        eventId: string;
        moderationRevision: number;
        promise: ReturnType<typeof api.eventStandings>;
      }
    | undefined
  >(undefined);
  const placementOptions = useMemo(
    () =>
      visibleMedia.flatMap((entrantMedia, index) => {
        const layers: MediaLayerKind[] = [];
        if (draft.mediaMode !== 'photo' && entrantMedia.characterUrl) layers.push('character');
        if (draft.mediaMode === 'photo' || (draft.mediaMode === 'combined' && entrantMedia.playerPhotoUrl))
          layers.push('photo');
        return layers.map((layer) => ({
          value: `${index}:${layer}`,
          label: t(layer === 'photo' ? 'operator:thumbnail.adjustPhoto' : 'operator:thumbnail.adjustCharacter', {
            player: draft.entrants[index]?.name ?? `Player ${index + 1}`
          })
        }));
      }),
    [draft.entrants, draft.mediaMode, visibleMedia, t]
  );
  useEffect(() => {
    if (!placementOptions.length) return;
    if (
      selectedLayer &&
      placementOptions.some((option) => option.value === `${selectedLayer.entrant}:${selectedLayer.layer}`)
    )
      return;
    setSelectedLayer(undefined);
  }, [placementOptions, selectedLayer]);
  useEffect(() => {
    if (!selectedEventId) {
      setAutomaticStandingsLoading(false);
      return;
    }
    if (
      automaticStandingsRequest.current?.eventId !== selectedEventId ||
      automaticStandingsRequest.current?.moderationRevision !== moderationRevision
    ) {
      automaticStandingsRequest.current = {
        eventId: selectedEventId,
        moderationRevision,
        promise: api.eventStandings(selectedEventId)
      };
    }
    let active = true;
    setAutomaticStandingsLoading(true);
    setStandingsNotice(undefined);
    void automaticStandingsRequest.current.promise
      .then((result) => {
        if (active) importFinalStandings(result);
      })
      .catch((error) => {
        if (active)
          setStandingsNotice({ text: error instanceof Error ? error.message : t('operator:topEight.standingsFailed') });
      })
      .finally(() => {
        if (active) setAutomaticStandingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedEventId, moderationRevision]);

  function resetSelectedPlacement() {
    if (!selectedLayer) return;
    controller.resetMediaTransform(selectedLayer.entrant, selectedLayer.layer);
    window.requestAnimationFrame(() => {
      canvasRef.current
        ?.querySelector<HTMLElement>('.keyboard-adjustable-media.is-selected')
        ?.focus({ preventScroll: true });
    });
  }

  async function loadFinalStandingsUrl() {
    const request = ++manualStandingsRequest.current;
    setManualStandingsLoading(true);
    setStandingsNotice(undefined);
    try {
      const result = await api.eventStandingsBySlug(normalizeEventSlug(loadUrl));
      if (request === manualStandingsRequest.current) importFinalStandings(result);
    } catch (error) {
      if (request === manualStandingsRequest.current)
        setStandingsNotice({ text: error instanceof Error ? error.message : t('operator:topEight.standingsFailed') });
    } finally {
      if (request === manualStandingsRequest.current) setManualStandingsLoading(false);
    }
  }

  function importFinalStandings(result: Awaited<ReturnType<typeof api.eventStandings>>) {
    if (!result.finalized || result.standings.length !== 8) {
      setStandingsNotice({ text: t('operator:topEight.standingsNotFinal') });
      return;
    }
    if (!hasConventionalTopEightPlacements(result.standings)) {
      setStandingsNotice({ text: t('operator:topEight.standingsNotConventional') });
      return;
    }
    const detectedGame = result.eventGameName
      ? gameIdForStartggVideogame({ id: '', name: result.eventGameName })
      : undefined;
    if (!selectedEventId && gameContextReady) {
      const detectedAssetSlug = detectedGame ?? gameAssetCatalogSlug({ name: result.eventGameName });
      controller.setGameContext(detectedGame, result.eventGameName, detectedAssetSlug);
    }
    controller.useFinalStandings(result);
    setImportRevision((revision) => revision + 1);
    setSelectedLayer(undefined);
    setStandingsNotice({ text: t('operator:topEight.standingsLoaded', { event: result.eventName }), imported: true });
  }

  async function downloadPng() {
    if (!canvasRef.current || !gameContextReady || validation || !previewCurrent) return;
    setExporting(true);
    try {
      const filename = safeGraphicFilename(draft.tournamentName, 'top-8');
      await exportGraphicAsPng(canvasRef.current, {
        ...broadcastSurfaceSpecs['top-eight'].canvas,
        filename,
        trustedText: topEightTrustedText(previewDraft)
      });
      notifications.show({
        title: t('operator:notices.done'),
        message: t('operator:messages.exportCompleted', { filename }),
        color: 'green',
        withCloseButton: true
      });
    } catch (error) {
      recordDiagnostic('export-failed', { area: 'generators' });
      notifications.show({
        title: t('operator:notices.actionFailed'),
        message: error instanceof Error ? error.message : t('operator:topEight.downloadFailed'),
        color: 'red',
        withCloseButton: true
      });
    } finally {
      setExporting(false);
    }
  }

  if (!profile) return null;
  return (
    <div className="generator-page">
      <GeneratorNavigation
        detailsId={`${sectionId}-details`}
        previewId={`${sectionId}-preview`}
        exporting={exporting}
        previewLoading={gameContextReady && !validation && !previewCurrent}
        reason={
          !gameContextReady
            ? t('operator:generators.selectGame')
            : validation
              ? t(`operator:topEight.validation.${validation}`)
              : !previewCurrent
                ? t('operator:quickTools.loadingPreview')
                : undefined
        }
        onDownload={() => void downloadPng()}
      />
      <Stack className="top8-generator-workspace" gap="md">
        <div className="generator-settings-row">
          <Paper className="panel generator-section" data-tutorial="top-eight-setup" radius="lg" withBorder>
            <PanelHeader
              title={t('operator:workspaces.generators.topEight.title')}
              icon={TrophyIcon}
              inset="var(--generator-section-padding)"
              mb="md"
            />
            <Stack gap="md">
              {gameSelector}
              <TopEightEventDetails
                importRevision={importRevision}
                controller={controller}
                loadUrl={loadUrl}
                onLoadUrlChange={setLoadUrl}
                onLoad={() => void loadFinalStandingsUrl()}
                loading={standingsLoading}
              />
              <SimpleGrid spacing="sm" type="container" cols={{ base: 1, '36rem': 2 }}>
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
              </SimpleGrid>
              {standingsNotice && !standingsNotice.imported && <Text size="sm">{standingsNotice.text}</Text>}
              {!gameContextReady && (
                <Text c="yellow" size="sm">
                  {t('operator:generators.selectEvent')}
                </Text>
              )}
              {validation && (
                <Text size="sm" c="yellow">
                  {t(`operator:topEight.validation.${validation}`)}
                </Text>
              )}
            </Stack>
          </Paper>
          <Paper className="panel generator-section top8-generator-controls" radius="lg" withBorder>
            <PanelHeader
              title={t('operator:quickTools.presentation')}
              icon={SlidersHorizontalIcon}
              inset="var(--generator-section-padding)"
              mb="md"
            />
            <Stack gap="md">
              <SimpleGrid spacing="sm" type="container" cols={{ base: 1, '36rem': 2 }}>
                <Select
                  label={t('operator:workspaces.styling')}
                  value={draft.stylingGameId}
                  searchable
                  data={sortedProfiles.map((candidate) => ({ value: candidate.id, label: candidate.styleName }))}
                  onChange={(value) => {
                    if (value) controller.setStyling(value as typeof draft.stylingGameId);
                    setSelectedLayer(undefined);
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
              </SimpleGrid>
              <GeneratorChoiceControl
                label={t('operator:topEight.mediaMode')}
                value={draft.mediaMode}
                data={topEightMediaModeIds.map((mode) => ({
                  value: mode,
                  label: t(`operator:topEight.mediaModes.${mode}`)
                }))}
                onChange={(value) => {
                  controller.setMediaMode(value);
                  setSelectedLayer(undefined);
                }}
              />
              <GeneratorChoiceControl
                label={t('operator:topEight.style')}
                value={draft.style}
                data={topEightStyleIds.map((style) => ({
                  value: style,
                  label: t(`operator:topEight.styles.${style}`)
                }))}
                onChange={(value) => {
                  controller.setStyle(value);
                  setSelectedLayer(undefined);
                }}
              />
              <ColorInput
                label={t('operator:topEight.headlineColor')}
                value={draft.headlineColor}
                onChange={controller.setHeadlineColor}
                format="hex"
              />
              <GraphicBackgroundControls value={draft.background} onChange={controller.setBackground} />
              <Group justify="flex-end" align="center">
                <Text size="xs" c="dimmed">
                  {t('operator:topEight.assetsMatched', { count: availableCharacterNames.length })}
                </Text>
              </Group>
            </Stack>
          </Paper>
        </div>
        <Paper
          id={`${sectionId}-preview`}
          className="panel generator-section generator-section-target top8-preview-panel generator-preview-panel"
          radius="lg"
          pos="relative"
          withBorder
        >
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
          <PanelHeader
            title={t('operator:topEight.preview')}
            icon={MonitorIcon}
            inset="var(--generator-section-padding)"
            mb="md"
          />
          <Text c="dimmed" size="xs" mb="sm">
            {t('operator:topEight.previewQuality')}
          </Text>
          <GeneratorMediaControls
            options={placementOptions}
            selection={selectedLayer && { index: selectedLayer.entrant, layer: selectedLayer.layer }}
            label={t('operator:topEight.adjustLayer')}
            resetLabel={t('operator:topEight.resetPlacement')}
            onSelect={(selection) =>
              setSelectedLayer(selection && { entrant: selection.index, layer: selection.layer })
            }
            onReset={resetSelectedPlacement}
          />
          <TopEightCanvas
            editable={previewCurrent}
            canvasRef={canvasRef}
            draft={canvasDraft}
            stylingProfile={stylingProfile}
            media={visibleMedia}
            logoUrl={logoUrl}
            placements={controller.mediaPlacements}
            selectedLayer={selectedLayer}
            onSelectLayer={(entrant, layer) => setSelectedLayer({ entrant, layer })}
            onPlacementChange={(index: number, layer: MediaLayerKind, transform: MediaTransform) =>
              controller.setMediaTransform(index, layer, transform)
            }
          />
          {standingsNotice?.imported && (
            <Text size="sm" ta="center" mt="sm">
              {standingsNotice.text}
            </Text>
          )}
        </Paper>
        <Paper
          id={`${sectionId}-details`}
          className="panel generator-section generator-section-target top8-entrants-panel"
          radius="lg"
          withBorder
        >
          <PanelHeader
            title={t('operator:topEight.placements')}
            icon={UsersIcon}
            inset="var(--generator-section-padding)"
            mb="md"
          />
          <SimpleGrid type="container" cols={{ base: 1, '40rem': 2, '72rem': 4 }}>
            {draft.entrants.map((entrant, index) => (
              <Paper
                key={`${entrant.placement}-${index}`}
                className="top8-entrant-editor operator-inset"
                p="md"
                radius="md"
                withBorder
              >
                <PanelHeader
                  title={t('operator:topEight.placement', { count: entrant.placement })}
                  icon={TrophyIcon}
                  order={3}
                  inset="md"
                />
                <div className="player-field-row">
                  <PlayerNameInput
                    label={t('operator:topEight.playerTag')}
                    value={entrant.name}
                    gameKey={draft.assetCatalogSlug}
                    onCommit={(name) =>
                      controller.setEntrant(index, { name, playerId: undefined, localPlayerId: undefined })
                    }
                    onSelectPlayer={(saved) => controller.setEntrant(index, saved)}
                  />
                  <BufferedTextInput
                    label={t('operator:topEight.sponsor')}
                    value={entrant.sponsor ?? ''}
                    onCommit={(sponsor) =>
                      controller.setEntrant(index, {
                        sponsor: sponsor || undefined
                      })
                    }
                  />
                </div>
                <div className="player-field-row">
                  <CharacterSelect
                    label={t('operator:editor.characters')}
                    value={playerCharacters(entrant)}
                    placeholder={t('common:actions.select')}
                    searchable
                    clearable
                    maxValues={maxCharactersForGame(draft.assetCatalogSlug ?? draft.gameId)}
                    data={characters.map((character) => ({ value: character, label: character }))}
                    onChange={(values) => controller.setEntrant(index, characterTeamSelection(values, entrant))}
                  />
                  <CharacterOutfitSelect
                    subject={entrant}
                    assets={characterAssets}
                    onChange={(characterAssetId) =>
                      controller.setEntrant(index, {
                        characterAssetId
                      })
                    }
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
                    onCommit={(xHandle) =>
                      controller.setEntrant(index, {
                        xHandle: normalizeTopEightXHandle(xHandle)
                      })
                    }
                  />
                </div>
              </Paper>
            ))}
          </SimpleGrid>
        </Paper>
      </Stack>
    </div>
  );
}
