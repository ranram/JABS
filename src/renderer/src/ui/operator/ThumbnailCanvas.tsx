import { type CSSProperties, type Ref } from 'react';
import type { GameProfile } from '@shared/gameProfiles';
import type { ThumbnailDraft } from '@shared/thumbnail';
import type { MediaLayerKind, MediaTransform, PlayerMediaPlacement } from '@shared/mediaPlacement';
import { AdjustableMediaImage } from './AdjustableMediaImage';
import { displayFlagUrl, isPrideDisplayFlag } from '../overlayPlayerPresentation';
import type { CharacterPortrait } from '../../characterPortraits';
import { CharacterPortraitStrip } from '../CharacterPortraitStrip';

export type ThumbnailMedia = {
  characterUrl?: string;
  playerPhotoUrl?: string;
  sponsorLogoUrl?: string;
  characterPortraits?: CharacterPortrait[];
};

export function thumbnailTrustedText(
  draft: ThumbnailDraft
): string[] {
  return [
    draft.tournamentName,
    draft.headline,
    draft.players[0].sponsor ?? '',
    draft.players[0].name,
    'VS',
    draft.players[1].sponsor ?? '',
    draft.players[1].name,
    'JABS broadcast graphic',
    draft.gameName
  ];
}

type ThumbnailCanvasProps = {
  draft: ThumbnailDraft;
  stylingProfile: GameProfile;
  media: [ThumbnailMedia, ThumbnailMedia];
  logoUrl?: string;
  canvasRef?: Ref<HTMLElement>;
  placements: [PlayerMediaPlacement, PlayerMediaPlacement];
  selectedLayer?: { player: 0 | 1; layer: MediaLayerKind };
  onSelectLayer(player: 0 | 1, layer: MediaLayerKind): void;
  onPlacementChange(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform): void;
};

type ThumbnailStyle = CSSProperties & {
  '--thumbnail-accent': string;
  '--thumbnail-background': string;
  '--adjustable-media-outline': string;
};

export function ThumbnailCanvas({
  draft,
  stylingProfile,
  media,
  logoUrl,
  canvasRef,
  placements,
  selectedLayer,
  onSelectLayer,
  onPlacementChange
}: ThumbnailCanvasProps) {
  const style: ThumbnailStyle = {
    '--thumbnail-accent': stylingProfile.overlay.accent,
    '--thumbnail-background': stylingProfile.overlay.background,
    '--adjustable-media-outline': `color-mix(in srgb, ${stylingProfile.overlay.accent} 82%, white)`
  };
  return (
    <section ref={canvasRef} className={`thumbnail-canvas thumbnail-style-${draft.style}`} style={style}>
      <header className="thumbnail-header">
        {logoUrl && <LoadedImage src={logoUrl} className="thumbnail-event-logo" layer="foreground" />}
        <div className="thumbnail-heading">
          <span data-export-text>{draft.tournamentName}</span>
          <strong data-export-text>{draft.headline}</strong>
        </div>
      </header>
      <div className="thumbnail-matchup">
        <ThumbnailPlayer
          side="one"
          playerIndex={0}
          player={draft.players[0]}
          media={media[0]}
          placement={placements[0]}
          selectedLayer={selectedLayer}
          onSelectLayer={onSelectLayer}
          onPlacementChange={onPlacementChange}
        />
        <div className="thumbnail-versus" data-export-text>VS</div>
        <ThumbnailPlayer
          side="two"
          playerIndex={1}
          player={draft.players[1]}
          media={media[1]}
          placement={placements[1]}
          selectedLayer={selectedLayer}
          onSelectLayer={onSelectLayer}
          onPlacementChange={onPlacementChange}
        />
      </div>
      <footer><span data-export-text>JABS broadcast graphic</span><strong data-export-text>{draft.gameName}</strong></footer>
    </section>
  );
}

function ThumbnailPlayer({
  side,
  playerIndex,
  player,
  media,
  placement,
  selectedLayer,
  onSelectLayer,
  onPlacementChange
}: {
  side: 'one' | 'two';
  playerIndex: 0 | 1;
  player: ThumbnailDraft['players'][number];
  media: ThumbnailMedia;
  placement: PlayerMediaPlacement;
  selectedLayer?: { player: 0 | 1; layer: MediaLayerKind };
  onSelectLayer(player: 0 | 1, layer: MediaLayerKind): void;
  onPlacementChange(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform): void;
}) {
  const flagUrl = displayFlagUrl(player.country, player.displayFlag);
  const prideFlag = isPrideDisplayFlag(player.displayFlag);
  return (
    <article className={`thumbnail-player thumbnail-player-${side}${media.playerPhotoUrl ? ' has-photo' : ''}${media.characterUrl ? ' has-character' : ''}${media.sponsorLogoUrl ? ' has-sponsor' : ''}`} data-export-clip>
      <div className="thumbnail-subject">
        {media.characterUrl && (
          <AdjustableMediaImage
            src={media.characterUrl}
            className="thumbnail-character"
            label={`${player.name} character artwork`}
            transform={placement.character}
            selected={selectedLayer?.player === playerIndex && selectedLayer.layer === 'character'}
            onSelect={() => onSelectLayer(playerIndex, 'character')}
            onChange={(transform) => onPlacementChange(playerIndex, 'character', transform)}
          />
        )}
        {media.playerPhotoUrl && (
          <AdjustableMediaImage
            src={media.playerPhotoUrl}
            className="thumbnail-player-photo"
            label={`${player.name} player photo`}
            transform={placement.photo}
            selected={selectedLayer?.player === playerIndex && selectedLayer.layer === 'photo'}
            onSelect={() => onSelectLayer(playerIndex, 'photo')}
            onChange={(transform) => onPlacementChange(playerIndex, 'photo', transform)}
          />
        )}
      </div>
      <CharacterPortraitStrip
        portraits={media.characterPortraits ?? []}
        className="thumbnail-character-portraits"
        side={side === 'one' ? 'left' : 'right'}
      />
      <div className="thumbnail-identity" data-export-shape="thumbnail-identity">
        {media.sponsorLogoUrl && <LoadedImage src={media.sponsorLogoUrl} className="thumbnail-sponsor-logo" layer="foreground" />}
        {player.sponsor && <span className="thumbnail-sponsor-text" data-export-text>{player.sponsor}</span>}
        <span className="thumbnail-name-row">
          {side === 'one' && flagUrl && <LoadedImage src={flagUrl} className={`thumbnail-country-flag${prideFlag ? ' is-pride' : ''}`} layer="foreground" />}
          <strong data-export-text>{player.name}</strong>
          {side === 'two' && flagUrl && <LoadedImage src={flagUrl} className={`thumbnail-country-flag${prideFlag ? ' is-pride' : ''}`} layer="foreground" />}
        </span>
      </div>
    </article>
  );
}

function LoadedImage({
  src,
  className,
  layer = 'subject',
  mirrorX = false
}: {
  src: string;
  className: string;
  layer?: 'subject' | 'foreground';
  mirrorX?: boolean;
}) {
  return (
    <img
      className={`${className} is-loaded`}
      src={src}
      alt=""
      aria-hidden="true"
      data-export-image-layer={layer}
      data-export-mirror-x={mirrorX || undefined}
      onLoad={(event) => { event.currentTarget.style.removeProperty('display'); }}
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />
  );
}
