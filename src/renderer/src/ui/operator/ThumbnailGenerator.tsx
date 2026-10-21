import { recordDiagnostic } from '../../diagnostics';
import { CharacterSelect } from './CharacterSelect';
import { GeneratorNavigation } from './GeneratorNavigation';
import { PanelHeader } from '../PanelHeader';
import { PlayerNameInput } from '../players/PlayerNameInput';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  ColorInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import { broadcastSurfaceSpecs } from '@shared/broadcastCompositions';
import type { GameProfile } from '@shared/gameProfiles';
import type { CountryOption, LogoAsset, SelectedSetState } from '@shared/models';
import { characterTeamSelection, maxCharactersForGame, playerCharacters } from '@shared/characterTeams';
import {
  thumbnailMediaModeIds,
  thumbnailStyleIds,
  validateThumbnailDraft,
  type ThumbnailDraft,
  type ThumbnailMediaMode,
  type ThumbnailStyleId
} from '@shared/thumbnail';
import { sortByLabel } from './operatorUtils';
import { exportGraphicAsPng, safeGraphicFilename } from './exportGraphic';
import { ThumbnailCanvas, thumbnailTrustedText, type ThumbnailMedia } from './ThumbnailCanvas';
import type { ThumbnailDraftController } from './useThumbnailDraft';
import { useGeneratorWarningToast } from './useGeneratorWarningToast';
import { useGeneratorMedia } from './useGeneratorMedia';
import { useLogoAssetUrl } from '../../hooks/useLogoAssetUrl';
import { BufferedTextInput } from './BufferedTextInput';
import { DisplayFlagSelect } from './DisplayFlagSelect';
import { CharacterOutfitSelect } from './CharacterOutfitSelect';
import { GeneratorMediaControls } from './GeneratorMediaControls';
import { GraphicBackgroundControls } from './GraphicBackgroundControls';
import { api } from '../../api';
import './generatorFonts.css';
import './adjustableMedia.css';
import './thumbnail.css';

type ThumbnailGeneratorProps = {
  profiles: GameProfile[];
  activeSet?: SelectedSetState;
  selectedEventId?: string;
  moderationRevision: number;
  logos: LogoAsset[];
  gameSelector?: ReactNode;
  gameContextReady?: boolean;
  controller: ThumbnailDraftController;
  assetCatalogRevision: number;
  countries: CountryOption[];
};

export function ThumbnailGenerator({
  gameSelector,
  gameContextReady = true,
  selectedEventId,
  profiles,
  activeSet,
  moderationRevision,
  logos,
  controller,
  assetCatalogRevision,
  countries
}: ThumbnailGeneratorProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const { draft } = controller;
  const profile = profiles.find((candidate) => candidate.id === draft.gameId) ?? profiles[0];
  const stylingProfile = profiles.find((candidate) => candidate.id === draft.stylingGameId) ?? profile;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.styleName, locale),
    [profiles, locale]
  );
  const sortedLogos = useMemo(() => sortByLabel(logos, (logo) => logo.label, locale), [logos, locale]);
  const {
    previewDraft,
    media,
    ready: mediaReady,
    availableCharacterNames,
    characterAssets,
    logoUrl,
    warning
  } = useThumbnailMedia(draft, assetCatalogRevision);
  useGeneratorWarningToast('jabs-thumbnail-generator-warning', warning, String(t('operator:notices.actionFailed')));
  const characters = useMemo(
    () =>
      sortByLabel(
        [...new Set([...charactersForAssetCatalog(draft.assetCatalogSlug), ...availableCharacterNames])],
        (character) => character,
        locale
      ),
    [availableCharacterNames, draft.assetCatalogSlug, locale]
  );
  const visibleMedia = useMemo(
    () =>
      media.map((playerMedia) => ({
        characterUrl: previewDraft.mediaMode !== 'photo' ? playerMedia.characterUrl : undefined,
        playerPhotoUrl: previewDraft.mediaMode !== 'character' ? playerMedia.playerPhotoUrl : undefined,
        sponsorLogoUrl: previewDraft.showSponsorLogo ? playerMedia.sponsorLogoUrl : undefined,
        characterPortraits: previewDraft.mediaMode !== 'photo' ? playerMedia.characterPortraits : undefined
      })) as [ThumbnailMedia, ThumbnailMedia],
    [previewDraft.mediaMode, previewDraft.showSponsorLogo, media]
  );
  const ready = gameContextReady && validateThumbnailDraft(draft);
  const previewCurrent = mediaReady && previewDraft === draft;
  const [exporting, setExporting] = useState(false);
  const { selectedLayer, setSelectedLayer } = controller;
  const sectionId = useId();
  const canvasRef = useRef<HTMLElement>(null);
  const placementOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    visibleMedia.forEach((playerMedia, player) => {
      const name = draft.players[player]?.name ?? `Player ${player + 1}`;
      if (draft.mediaMode === 'photo' || (draft.mediaMode === 'combined' && playerMedia.playerPhotoUrl))
        options.push({
          value: `${player}:photo`,
          label: String(t('operator:thumbnail.adjustPhoto', { player: name }))
        });
      if (draft.mediaMode !== 'photo' && playerMedia.characterUrl)
        options.push({
          value: `${player}:character`,
          label: String(t('operator:thumbnail.adjustCharacter', { player: name }))
        });
    });
    return options;
  }, [draft.mediaMode, draft.players, t, visibleMedia]);
  useEffect(() => {
    if (!placementOptions.length) return;
    if (
      selectedLayer &&
      placementOptions.some((option) => option.value === `${selectedLayer.player}:${selectedLayer.layer}`)
    )
      return;
    setSelectedLayer(undefined);
  }, [placementOptions, selectedLayer]);
  useEffect(() => {
    if (!moderationRevision || !activeSet?.setId) return;
    let active = true;
    void api
      .inspectStartggSet(activeSet.setId, activeSet.gameId, {
        eventId: activeSet.eventId,
        tournamentSlug: activeSet.tournamentSlug,
        assetCatalogSlug: activeSet.assetCatalogSlug
      })
      .then((response) => {
        if (active) controller.restoreModeratedActiveSet(response.selectedSet);
      })
      .catch((error) => {
        if (active)
          notifications.show({
            title: t('operator:notices.actionFailed'),
            message: error instanceof Error ? error.message : t('operator:messages.reloadFailed'),
            color: 'red',
            withCloseButton: true
          });
      });
    return () => {
      active = false;
    };
  }, [moderationRevision]);

  function resetSelectedPlacement() {
    if (!selectedLayer) return;
    controller.resetMediaTransform(selectedLayer.player, selectedLayer.layer);
    window.requestAnimationFrame(() => {
      canvasRef.current
        ?.querySelector<HTMLElement>('.keyboard-adjustable-media.is-selected')
        ?.focus({ preventScroll: true });
    });
  }

  async function downloadPng() {
    if (!canvasRef.current || !ready || !previewCurrent) return;
    setExporting(true);
    try {
      const filename = safeGraphicFilename(draft.tournamentName, 'youtube-thumbnail');
      await exportGraphicAsPng(canvasRef.current, {
        ...broadcastSurfaceSpecs.thumbnail.canvas,
        filename,
        trustedText: thumbnailTrustedText(previewDraft)
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
        message: error instanceof Error ? error.message : t('operator:thumbnail.downloadFailed'),
        color: 'red',
        withCloseButton: true
      });
    } finally {
      setExporting(false);
    }
  }

  if (!profile) return null;
  return (
    <div className="generator-page thumbnail-generator">
      <GeneratorNavigation
        detailsId={`${sectionId}-details`}
        previewId={`${sectionId}-preview`}
        exporting={exporting}
        reason={
          !gameContextReady
            ? t('operator:generators.selectGame')
            : !ready
              ? t('operator:quickTools.enterPlayers')
              : !previewCurrent
                ? t('operator:quickTools.loadingPreview')
                : undefined
        }
        onDownload={() => void downloadPng()}
      />
      <Stack gap="md">
        <div className="generator-settings-row">
          <Paper className="panel generator-section" data-tutorial="thumbnail-setup" p="lg" radius="lg" withBorder>
            <PanelHeader
              title={t('operator:workspaces.generators.thumbnail.title')}
              description={t('operator:thumbnail.description')}
              mb="md"
            >
              <Badge color={ready ? 'green' : 'yellow'} variant="light">
                {ready ? t('operator:thumbnail.ready') : t('operator:thumbnail.needsDetails')}
              </Badge>
            </PanelHeader>
            <Stack gap="md">
              {gameSelector}
              <Stack gap="xs" align="flex-start">
                <Button
                  variant="default"
                  disabled={
                    !activeSet || !gameContextReady || Boolean(selectedEventId && activeSet.eventId !== selectedEventId)
                  }
                  onClick={() => {
                    if (activeSet) controller.useActiveSet(activeSet);
                    setSelectedLayer(undefined);
                  }}
                >
                  {t('operator:thumbnail.useStreamMatch')}
                </Button>
                <Text c="dimmed" size="xs">
                  {t('operator:thumbnail.autoStreamMatch')}
                </Text>
              </Stack>
              <SimpleGrid spacing="sm" type="container" cols={{ base: 1, '36rem': 2 }}>
                <BufferedTextInput
                  label={t('operator:thumbnail.tournament')}
                  value={draft.tournamentName}
                  onCommit={(tournamentName) => controller.setText({ tournamentName })}
                />
                <BufferedTextInput
                  label={t('operator:thumbnail.headline')}
                  value={draft.headline}
                  onCommit={(headline) => controller.setText({ headline })}
                />
              </SimpleGrid>
            </Stack>
          </Paper>
          <Paper className="panel generator-section" p="lg" radius="lg" withBorder>
            <PanelHeader title={t('operator:quickTools.presentation')} mb="md" />
            <Stack gap="md">
              <SimpleGrid spacing="sm" type="container" cols={{ base: 1, '28rem': 2 }}>
                {(['showTournamentLogo', 'showSponsorLogo'] as const).map((setting) => (
                  <Switch
                    key={setting}
                    checked={draft[setting]}
                    label={t(`operator:thumbnail.${setting}`)}
                    onChange={(event) => controller.setVisibility(setting, event.currentTarget.checked)}
                  />
                ))}
              </SimpleGrid>
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
                  label={t('operator:thumbnail.logo')}
                  value={draft.logoAssetId ?? null}
                  placeholder={t('operator:thumbnail.noLogo')}
                  searchable
                  clearable
                  data={sortedLogos.map((logo) => ({ value: logo.id, label: logo.label }))}
                  onChange={(value) => controller.setText({ logoAssetId: value ?? undefined })}
                />
              </SimpleGrid>
              <SimpleGrid spacing="sm" type="container" cols={{ base: 1, '36rem': 2 }}>
                <div>
                  <Text fw={700} size="sm" mb={4}>
                    {t('operator:thumbnail.mediaMode')}
                  </Text>
                  <SegmentedControl
                    fullWidth
                    value={draft.mediaMode}
                    data={thumbnailMediaModeIds.map((mode) => ({
                      value: mode,
                      label: t(`operator:thumbnail.mediaModes.${mode}`)
                    }))}
                    onChange={(value) => {
                      controller.setMediaMode(value as ThumbnailMediaMode);
                      setSelectedLayer(undefined);
                    }}
                  />
                  {draft.mediaMode === 'combined' && (
                    <Text c="dimmed" size="sm" mt="xs">
                      {t('operator:mediaControls.combinedEditingHelp')}
                    </Text>
                  )}
                </div>
                <div>
                  <Text fw={700} size="sm" mb={4}>
                    {t('operator:thumbnail.style')}
                  </Text>
                  <SegmentedControl
                    fullWidth
                    value={draft.style}
                    data={thumbnailStyleIds.map((style) => ({
                      value: style,
                      label: t(`operator:thumbnail.styles.${style}`)
                    }))}
                    onChange={(value) => {
                      controller.setStyle(value as ThumbnailStyleId);
                      setSelectedLayer(undefined);
                    }}
                  />
                </div>
              </SimpleGrid>
              <ColorInput
                label={t('operator:thumbnail.headlineColor')}
                value={draft.headlineColor}
                onChange={(headlineColor) => controller.setText({ headlineColor })}
                format="hex"
              />
              <GraphicBackgroundControls value={draft.background} onChange={controller.setBackground} />
            </Stack>
          </Paper>
        </div>
        <div className="generator-workspace">
          <div id={`${sectionId}-details`} className="generator-editor-column generator-section-target">
            <SimpleGrid type="container" cols={{ base: 1, '42rem': 2 }}>
              {draft.players.map((player, index) => (
                <Paper key={index} className="panel generator-player-panel" p="md" radius="lg" withBorder>
                  <Title order={3} size="h5" mb="md">
                    {t('operator:thumbnail.player', { count: index + 1 })}
                  </Title>
                  <SimpleGrid spacing="sm" type="container" cols={{ base: 1, '24rem': 2 }}>
                    <PlayerNameInput
                      label={t('operator:topEight.playerTag')}
                      value={player.name}
                      gameKey={draft.assetCatalogSlug}
                      onCommit={(name) =>
                        controller.setPlayer(index as 0 | 1, { name, playerId: undefined, localPlayerId: undefined })
                      }
                      onSelectPlayer={(saved) => controller.setPlayer(index as 0 | 1, saved)}
                    />
                    <BufferedTextInput
                      label={t('operator:topEight.sponsor')}
                      value={player.sponsor ?? ''}
                      onCommit={(sponsor) =>
                        controller.setPlayer(index as 0 | 1, {
                          sponsor: sponsor || undefined
                        })
                      }
                    />
                    <CharacterSelect
                      label={t('operator:editor.characters')}
                      value={playerCharacters(player)}
                      placeholder={t('common:actions.select')}
                      searchable
                      clearable
                      maxValues={maxCharactersForGame(draft.assetCatalogSlug ?? draft.gameId)}
                      data={characters.map((character) => ({ value: character, label: character }))}
                      onChange={(values) =>
                        controller.setPlayer(index as 0 | 1, characterTeamSelection(values, player))
                      }
                    />
                    <CharacterOutfitSelect
                      subject={player}
                      assets={characterAssets}
                      onChange={(characterAssetId) => controller.setPlayer(index as 0 | 1, { characterAssetId })}
                    />
                    <DisplayFlagSelect
                      label={t('operator:topEight.displayFlag')}
                      placeholder={t('common:actions.select')}
                      countries={countries}
                      country={player.country}
                      displayFlag={player.displayFlag}
                      onChange={(selection) => controller.setPlayer(index as 0 | 1, selection)}
                    />
                  </SimpleGrid>
                </Paper>
              ))}
            </SimpleGrid>
          </div>
          <div className="generator-preview-column">
            <Paper
              id={`${sectionId}-preview`}
              className="panel generator-section generator-section-target generator-preview-panel"
              p="lg"
              radius="lg"
              withBorder
            >
              <Text fw={800} mb="sm">
                {t('operator:thumbnail.preview')}
              </Text>
              <GeneratorMediaControls
                options={placementOptions}
                selection={selectedLayer && { index: selectedLayer.player, layer: selectedLayer.layer }}
                label={t('operator:thumbnail.adjustLayer')}
                resetLabel={t('operator:thumbnail.resetPlacement')}
                onSelect={(selection) =>
                  setSelectedLayer(selection && { player: selection.index as 0 | 1, layer: selection.layer })
                }
                onReset={resetSelectedPlacement}
              />
              <ThumbnailCanvas
                editable={previewCurrent}
                canvasRef={canvasRef}
                draft={previewDraft}
                stylingProfile={stylingProfile}
                media={visibleMedia}
                logoUrl={draft.showTournamentLogo ? logoUrl : undefined}
                placements={controller.mediaPlacements}
                selectedLayer={selectedLayer}
                onSelectLayer={(player, layer) => setSelectedLayer({ player, layer })}
                onPlacementChange={controller.setMediaTransform}
              />
            </Paper>
          </div>
        </div>
      </Stack>
    </div>
  );
}

function useThumbnailMedia(draft: ThumbnailDraft, assetCatalogRevision: number) {
  const resolved = useGeneratorMedia({
    draft,
    subjects: draft.players,
    assetCatalogSlug: draft.assetCatalogSlug,
    assetCatalogRevision,
    context: { tournamentName: draft.tournamentName, headline: draft.headline }
  });
  const logoUrl = useLogoAssetUrl(draft.logoAssetId);
  return {
    ...resolved,
    media: resolved.media as [ThumbnailMedia, ThumbnailMedia],
    logoUrl
  };
}
