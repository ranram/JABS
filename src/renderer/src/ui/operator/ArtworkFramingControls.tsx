import { ShareArtworkFraming } from './ShareArtworkFraming';
import { useEffect, useRef, useState } from 'react';
import { Button, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  artworkFramingKeys,
  artworkFramingLayout,
  artworkPlacement,
  clampArtworkTransform,
  updateArtworkPlacement,
  type ArtworkFraming
} from '@shared/artworkFraming';
import {
  defaultCharacterTransform,
  defaultMediaTransform,
  type MediaLayerKind,
  type MediaTransform
} from '@shared/mediaPlacement';
import type { SelectedSetState } from '@shared/models';
import type { ResultScreenState } from '@shared/resultScreen';
import { resolveGameProfile } from '@shared/gameProfiles';
import type { SubjectMedia } from '../useVersusMedia';
import { ArtworkFramingSubject } from './ArtworkFramingSubject';
import { MediaControlHint } from './MediaControlHint';
import playerPlaceholder from '../../assets/player_placeholder.svg';
import '../resultScreen/victory.css';
import '../resultScreen/spotlight.css';
import '../resultScreen/artworkSides.css';
import '../resultScreen/highlight.css';
import '../playerStats/playerStats.css';
import './versusPreview.css';
import './artworkFramingControls.css';

export function ArtworkFramingControls({
  activeSet,
  framing,
  layout,
  showCharacter,
  showPhoto,
  showBackground = true,
  media,
  ready,
  winnerSide,
  stylingGameId,
  highlightSettings,
  mirrorCharacterPlacement,
  onChange
}: {
  activeSet: SelectedSetState;
  framing: ArtworkFraming;
  layout: 'stats' | 'classic' | 'victory' | 'spotlight' | 'highlight';
  showCharacter: boolean;
  showPhoto: boolean;
  showBackground?: boolean;
  media: [SubjectMedia, SubjectMedia];
  ready: boolean;
  winnerSide?: 0 | 1;
  stylingGameId?: SelectedSetState['stylingGameId'];
  mirrorCharacterPlacement?: boolean;
  highlightSettings?: Pick<ResultScreenState, 'showIdentity' | 'showWinnerTitle' | 'showSponsorLogo'>;
  onChange(update: (framing: ArtworkFraming) => ArtworkFraming): void;
}) {
  const { t } = useTranslation('operator');
  const [selected, setSelected] = useState<{ side: 0 | 1; layer: MediaLayerKind }>();
  const shell = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const sides: Array<0 | 1> = layout === 'stats' ? [0, 1] : winnerSide === undefined ? [] : [winnerSide];
  const selectedArtwork = selected ? visibleArtwork(selected.side) : undefined;
  const selection =
    selected &&
    sides.includes(selected.side) &&
    (selected.layer === 'character' ? selectedArtwork?.characterUrl : selectedArtwork?.photoUrl)
      ? selected
      : undefined;
  useEffect(() => {
    if (!shell.current) return;
    const element = shell.current;
    const update = () => setScale(element.clientWidth / 1920);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [layout, winnerSide]);
  function visibleArtwork(side: 0 | 1) {
    return {
      characterUrl: showCharacter ? media[side].characterUrl : undefined,
      photoUrl: showPhoto ? (media[side].photoUrl ?? (ready ? playerPlaceholder : undefined)) : undefined
    };
  }
  function framingKeys(side: 0 | 1) {
    const visible = visibleArtwork(side);
    const player = side === 0 ? activeSet.playerOne : activeSet.playerTwo;
    return artworkFramingKeys(
      activeSet,
      player,
      artworkFramingLayout(layout, Boolean(visible.characterUrl), Boolean(visible.photoUrl)),
      media[side],
      side,
      framing,
      mirrorCharacterPlacement
    );
  }
  function change(side: 0 | 1, layer: MediaLayerKind, transform: MediaTransform) {
    if (!sides.includes(side)) return;
    const visible = visibleArtwork(side);
    if (!(layer === 'character' ? visible.characterUrl : visible.photoUrl)) return;
    const keys = framingKeys(side);
    onChange((current) => updateArtworkPlacement(current, keys, layer, clampArtworkTransform(transform)));
  }
  const options = sides.flatMap((side) => {
    const player = side === 0 ? activeSet.playerOne : activeSet.playerTwo;
    return (['character', 'photo'] as const)
      .filter((layer) =>
        layer === 'character' ? showCharacter && media[side].characterUrl : showPhoto && media[side].photoUrl
      )
      .map((layer) => ({
        value: `${side}:${layer}`,
        label: t(layer === 'photo' ? 'thumbnail.adjustPhoto' : 'thumbnail.adjustCharacter', { player: player.name })
      }));
  });
  if (!sides.length)
    return (
      <Text c="dimmed" size="sm">
        {t('workspaces.resultScreen.noWinner')}
      </Text>
    );
  return (
    <Stack gap="sm">
      <Text fw={700}>{t('artworkFraming.title')}</Text>
      {mirrorCharacterPlacement !== undefined && (
        <Text size="sm" c="dimmed">
          {t('artworkFraming.mirroringHelp')}
        </Text>
      )}
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
        <Select
          label={t('thumbnail.adjustLayer')}
          placeholder={t('actions.select')}
          clearable
          data={options}
          value={selection ? `${selection.side}:${selection.layer}` : null}
          onChange={(value) => {
            if (!value) return setSelected(undefined);
            const [side, layer] = value.split(':');
            setSelected({ side: Number(side) as 0 | 1, layer: layer as MediaLayerKind });
          }}
        />
        <Group align="flex-end" grow>
          <Button
            variant="default"
            disabled={!selection}
            onClick={() => {
              if (!selection) return;
              const { side, layer } = selection;
              const transform =
                layer === 'character'
                  ? defaultCharacterTransform(side, mirrorCharacterPlacement)
                  : defaultMediaTransform();
              change(side, layer, transform);
            }}
          >
            {t('topEight.resetPlacement')}
          </Button>
          {selection?.layer === 'character' &&
            (() => {
              const player = selection.side === 0 ? activeSet.playerOne : activeSet.playerTwo;
              const game = activeSet.assetCatalogSlug ?? activeSet.gameId;
              return (
                <ShareArtworkFraming
                  key={JSON.stringify([game, player.character, player.characterAssetId])}
                  game={game}
                  player={player}
                />
              );
            })()}
        </Group>
      </SimpleGrid>
      <MediaControlHint showOverlapSelection behindModifier="Ctrl" />
      <div
        ref={shell}
        className={`versus-preview-shell artwork-framing-shell${showBackground ? '' : ' is-transparent-preview'}`}
      >
        <div className="versus-preview-stage artwork-framing-canvas" style={{ transform: `scale(${scale})` }}>
          {sides.map((side) => {
            const player = side === 0 ? activeSet.playerOne : activeSet.playerTwo;
            const visible = visibleArtwork(side);
            const keys = framingKeys(side);
            return (
              <ArtworkFramingSubject
                key={JSON.stringify([side, keys.character, keys.photo])}
                player={player}
                side={side}
                layout={layout}
                showBackground={showBackground}
                theme={
                  resolveGameProfile(stylingGameId ?? activeSet.stylingGameId ?? activeSet.gameId).overlay.themeClass
                }
                characterUrl={visible.characterUrl}
                characterFrame={media[side].characterFrame}
                photoUrl={visible.photoUrl}
                sponsorUrl={media[side].sponsorUrl}
                highlightSettings={highlightSettings}
                placement={artworkPlacement(framing, keys)}
                selected={selection?.side === side ? selection.layer : undefined}
                onSelect={(layer) => setSelected({ side, layer })}
                onChange={(layer, transform) => change(side, layer, transform)}
              />
            );
          })}
        </div>
      </div>
    </Stack>
  );
}
