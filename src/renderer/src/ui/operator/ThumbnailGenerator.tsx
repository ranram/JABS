import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  MultiSelect,
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
import { characterOutfitOptions } from '@shared/characterAssets';
import {
  type MediaLayerKind,
  type MediaTransform
} from '@shared/mediaPlacement';
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
import { MediaFoldersAccordion } from './MediaFoldersAccordion';
import {
  ThumbnailCanvas,
  thumbnailTrustedText,
  type ThumbnailMedia
} from './ThumbnailCanvas';
import type { ThumbnailDraftController } from './useThumbnailDraft';
import { useGeneratorWarningToast } from './useGeneratorWarningToast';
import { useGeneratorMedia, useLogoAssetUrl } from './useGeneratorMedia';
import { BufferedTextInput } from './BufferedTextInput';
import { DisplayFlagSelect } from './DisplayFlagSelect';
import { CharacterOutfitSelect } from './CharacterOutfitSelect';
import { api } from '../../api';
import './generatorFonts.css';
import './adjustableMedia.css';
import './thumbnail.css';

type ThumbnailGeneratorProps = {
  profiles: GameProfile[];
  activeSet?: SelectedSetState;
  moderationRevision: number;
  logos: LogoAsset[];
  controller: ThumbnailDraftController;
  assetCatalogRevision: number;
  assetCatalogSlug?: string;
  countries: CountryOption[];
};

const noMediaSelection = '__none__';

export function ThumbnailGenerator({ profiles, activeSet, moderationRevision, logos, controller, assetCatalogRevision, assetCatalogSlug, countries }: ThumbnailGeneratorProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const { draft } = controller;
  const resolvedAssetCatalogSlug = assetCatalogSlug ?? draft.assetCatalogSlug;
  const profile = profiles.find((candidate) => candidate.id === draft.gameId) ?? profiles[0];
  const stylingProfile = profiles.find((candidate) => candidate.id === draft.stylingGameId) ?? profile;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(() => sortByLabel(profiles, (profile) => profile.styleName, locale), [profiles, locale]);
  const sortedLogos = useMemo(() => sortByLabel(logos, (logo) => logo.label, locale), [logos, locale]);
  const {
    previewDraft, media, availableCharacterNames, characterAssets, logoUrl, warning
  } = useThumbnailMedia(draft, assetCatalogRevision);
  useGeneratorWarningToast(
    'jabs-thumbnail-generator-warning',
    warning,
    String(t('operator:notices.actionFailed'))
  );
  const characters = useMemo(
    () => sortByLabel([...new Set([
      ...charactersForAssetCatalog(draft.assetCatalogSlug),
      ...availableCharacterNames
    ])], (character) => character, locale),
    [availableCharacterNames, draft.assetCatalogSlug, locale]
  );
  const visibleMedia = useMemo(() => media.map((playerMedia) => ({
    characterUrl: draft.mediaMode === 'character' ? playerMedia.characterUrl : undefined,
    playerPhotoUrl: draft.mediaMode === 'photo' ? playerMedia.playerPhotoUrl : undefined,
    sponsorLogoUrl: draft.showSponsorLogo ? playerMedia.sponsorLogoUrl : undefined,
    characterPortraits: draft.mediaMode === 'character' ? playerMedia.characterPortraits : undefined
  })) as [ThumbnailMedia, ThumbnailMedia], [
    draft.mediaMode,
    draft.showSponsorLogo,
    media
  ]);
  const ready = validateThumbnailDraft(draft);
  const previewCurrent = previewDraft === draft;
  const [exporting, setExporting] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<{ player: 0 | 1; layer: MediaLayerKind }>();
  const canvasRef = useRef<HTMLElement>(null);
  const placementOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    visibleMedia.forEach((playerMedia, player) => {
      const name = draft.players[player]?.name ?? `Player ${player + 1}`;
      if (playerMedia.characterUrl) options.push({
        value: `${player}:character`,
        label: String(t('operator:thumbnail.adjustCharacter', { player: name }))
      });
      if (playerMedia.playerPhotoUrl) options.push({
        value: `${player}:photo`,
        label: String(t('operator:thumbnail.adjustPhoto', { player: name }))
      });
    });
    return options;
  }, [draft.players, t, visibleMedia]);
  useEffect(() => {
    if (selectedLayer && placementOptions.some((option) => option.value === `${selectedLayer.player}:${selectedLayer.layer}`)) return;
    setSelectedLayer(undefined);
  }, [placementOptions, selectedLayer]);
  useEffect(() => {
    setSelectedLayer(undefined);
  }, [draft.gameId, draft.stylingGameId, draft.style, draft.mediaMode, draft.players[0].name, draft.players[1].name]);
  useEffect(() => {
    if (!moderationRevision || !activeSet?.setId) return;
    let active = true;
    void api.inspectStartggSet(activeSet.setId, activeSet.gameId, {
      eventId: activeSet.eventId,
      tournamentSlug: activeSet.tournamentSlug,
      assetCatalogSlug: activeSet.assetCatalogSlug
    }).then((response) => {
      if (active) controller.restoreModeratedActiveSet(response.selectedSet);
    }).catch((error) => {
      if (active) notifications.show({
        title: t('operator:notices.actionFailed'),
        message: error instanceof Error ? error.message : t('operator:messages.reloadFailed'),
        color: 'red',
        autoClose: false,
        withCloseButton: true
      });
    });
    return () => { active = false; };
  }, [moderationRevision]);

  function setMediaTransform(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform) {
    controller.setMediaTransform(player, layer, transform);
  }

  function resetSelectedPlacement() {
    if (!selectedLayer) return;
    controller.resetMediaTransform(selectedLayer.player, selectedLayer.layer);
    window.requestAnimationFrame(() => {
      canvasRef.current?.querySelector<HTMLElement>('.keyboard-adjustable-media.is-selected')?.focus({ preventScroll: true });
    });
  }

  async function downloadPng() {
    if (!canvasRef.current || !ready || !previewCurrent) return;
    setExporting(true);
    try {
      await exportGraphicAsPng(canvasRef.current, {
        ...broadcastSurfaceSpecs.thumbnail.canvas,
        filename: safeGraphicFilename(draft.tournamentName, 'youtube-thumbnail'),
        trustedText: thumbnailTrustedText(previewDraft)
      });
      notifications.show({
        title: t('operator:notices.done'),
        message: t('operator:thumbnail.downloaded'),
        color: 'green',
        autoClose: 6_000,
        withCloseButton: true
      });
    } catch (error) {
      notifications.show({
        title: t('operator:notices.actionFailed'),
        message: error instanceof Error ? error.message : t('operator:thumbnail.downloadFailed'),
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
      <Paper className="panel" p="lg" radius="lg" withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={2} size="h4">{t('operator:workspaces.generators.thumbnail.title')}</Title>
            <Text c="dimmed" size="sm">{t('operator:thumbnail.description')}</Text>
          </div>
          <Badge color={ready ? 'green' : 'yellow'} variant="light">
            {ready ? t('operator:thumbnail.ready') : t('operator:thumbnail.needsDetails')}
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
              setSelectedLayer(undefined);
            }}
          />
          <div>
            <Text fw={700} size="sm" mb={5}>{t('operator:thumbnail.style')}</Text>
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
          <div>
            <Text fw={700} size="sm" mb={5}>{t('operator:thumbnail.mediaMode')}</Text>
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
          </div>
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
        <Box mt="sm">
          <MediaFoldersAccordion gameAssetSubpath={`${resolvedAssetCatalogSlug}/characters`} />
        </Box>
        <Group mt="md">
          <Button
            variant="default"
            disabled={!activeSet}
            onClick={() => {
              if (activeSet) controller.useActiveSet(activeSet);
              setSelectedLayer(undefined);
            }}
          >
            {t('operator:thumbnail.useStreamMatch')}
          </Button>
          <Text c="dimmed" size="xs">{t('operator:thumbnail.autoStreamMatch')}</Text>
        </Group>
        <SimpleGrid type="container" cols={{ base: 1, '28rem': 2 }} mt="md">
          {([
            'showTournamentLogo',
            'showSponsorLogo'
          ] as const).map((setting) => (
            <Switch
              key={setting}
              checked={draft[setting]}
              label={t(`operator:thumbnail.${setting}`)}
              onChange={(event) => controller.setVisibility(setting, event.currentTarget.checked)}
            />
          ))}
        </SimpleGrid>
      </Paper>

      <Paper className="panel" p="md" radius="lg" withBorder>
        <Group justify="space-between" mb="sm">
          <Text fw={800}>{t('operator:thumbnail.preview')}</Text>
          <Button
            size="compact-sm"
            disabled={!ready || !previewCurrent || exporting}
            loading={exporting}
            onClick={() => void downloadPng()}
          >
            {t('operator:thumbnail.downloadPng')}
          </Button>
        </Group>
        {placementOptions.length > 0 && (
          <Stack gap="xs" mb="md">
            <SimpleGrid type="container" cols={{ base: 1, '34rem': 2 }}>
              <Select
                label={t('operator:thumbnail.adjustLayer')}
                value={selectedLayer ? `${selectedLayer.player}:${selectedLayer.layer}` : noMediaSelection}
                placeholder={t('common:actions.select')}
                clearable
                data={[
                  { value: noMediaSelection, label: t('common:actions.select') },
                  ...placementOptions
                ]}
                onChange={(value: string | null) => {
                  if (!value || value === noMediaSelection) {
                    setSelectedLayer(undefined);
                    return;
                  }
                  const [player, layer] = value?.split(':') ?? [];
                  if (player && layer) setSelectedLayer({ player: Number(player) as 0 | 1, layer: layer as MediaLayerKind });
                }}
              />
              <Group align="flex-end">
                <Button fullWidth variant="default" disabled={!selectedLayer} onClick={resetSelectedPlacement}>
                  {t('operator:thumbnail.resetPlacement')}
                </Button>
              </Group>
            </SimpleGrid>
            <Text c="dimmed" size="xs">{t('operator:thumbnail.adjustHint')}</Text>
          </Stack>
        )}
        <ThumbnailCanvas
          canvasRef={canvasRef}
          draft={previewDraft}
          stylingProfile={stylingProfile}
          media={visibleMedia}
          logoUrl={draft.showTournamentLogo ? logoUrl : undefined}
          placements={controller.mediaPlacements}
          selectedLayer={selectedLayer}
          onSelectLayer={(player, layer) => setSelectedLayer({ player, layer })}
          onPlacementChange={setMediaTransform}
        />
      </Paper>

      <SimpleGrid type="container" cols={{ base: 1, '42rem': 2 }}>
        {draft.players.map((player, index) => (
          <Paper key={index} className="panel" p="lg" radius="lg" withBorder>
            <Title order={3} size="h5" mb="md">{t('operator:thumbnail.player', { count: index + 1 })}</Title>
            <SimpleGrid type="container" cols={{ base: 1, '24rem': 2 }}>
              <BufferedTextInput
                label={t('operator:topEight.playerTag')}
                value={player.name}
                onCommit={(name) => controller.setPlayer(index as 0 | 1, { name })}
              />
              {characterOutfitOptions(player, characterAssets).length > 1 && (
                <BufferedTextInput
                  label={t('operator:topEight.sponsor')}
                  value={player.sponsor ?? ''}
                  onCommit={(sponsor) => controller.setPlayer(index as 0 | 1, {
                    sponsor: sponsor || undefined
                  })}
                />
              )}
              <MultiSelect
                label={t('operator:editor.characters')}
                value={playerCharacters(player)}
                placeholder={t('common:actions.select')}
                searchable
                clearable
                maxValues={maxCharactersForGame(draft.gameId)}
                data={characters.map((character) => ({ value: character, label: character }))}
                onChange={(values) => controller.setPlayer(
                  index as 0 | 1,
                  characterTeamSelection(values, player)
                )}
              />
              <CharacterOutfitSelect
                subject={player}
                assets={characterAssets}
                onChange={(characterAssetId) => controller.setPlayer(
                  index as 0 | 1,
                  { characterAssetId }
                )}
              />
              {characterOutfitOptions(player, characterAssets).length <= 1 && (
                <BufferedTextInput
                  label={t('operator:topEight.sponsor')}
                  value={player.sponsor ?? ''}
                  onCommit={(sponsor) => controller.setPlayer(index as 0 | 1, {
                    sponsor: sponsor || undefined
                  })}
                />
              )}
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
    </Stack>
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
    logoUrl,
  };
}
