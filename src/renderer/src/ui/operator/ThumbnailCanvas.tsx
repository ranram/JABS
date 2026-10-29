import { useAppearanceStyle } from '../appearance/AppearanceProvider';
import { ThumbnailName } from './ThumbnailName';
import { type CSSProperties, type Ref } from 'react';
import type { GameProfile } from '@shared/gameProfiles';
import type { ThumbnailDraft } from '@shared/thumbnail';
import type { MediaLayerKind, MediaTransform, PlayerMediaPlacement } from '@shared/mediaPlacement';
import { PlayerMediaLayers } from '../PlayerMediaLayers';
import { mediaInteractionKey } from '../mediaIdentity';
import { displayFlagUrl, isPrideDisplayFlag } from '../overlayPlayerPresentation';
import type { CharacterPortrait } from '../../characterPortraits';
import { CharacterPortraitStrip } from '../CharacterPortraitStrip';

export type ThumbnailMedia = {
  characterUrl?: string;
  playerPhotoUrl?: string;
  sponsorLogoUrl?: string;
  characterPortraits?: CharacterPortrait[];
};

export function thumbnailTrustedText(draft: ThumbnailDraft): string[] {
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
  editable?: boolean;
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
  '--thumbnail-headline-color': string;
  '--adjustable-media-outline': string;
};

export function ThumbnailCanvas({
  editable = true,
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
  const appearanceStyle = useAppearanceStyle();
  const style: ThumbnailStyle = {
    '--thumbnail-accent': stylingProfile.overlay.accent,
    '--thumbnail-background': stylingProfile.overlay.background,
    '--thumbnail-headline-color': draft.headlineColor,
    '--adjustable-media-outline': `color-mix(in srgb, ${stylingProfile.overlay.accent} 82%, white)`,
    ...appearanceStyle
  };
  return (
    <section
      ref={canvasRef}
      className={`thumbnail-canvas thumbnail-style-${draft.style}${draft.background ? ' has-custom-background' : ''}`}
      style={style}
    >
      {draft.background && (
        <LoadedImage src={draft.background.dataUrl} className="thumbnail-custom-background" layer="background" />
      )}
      <header className="thumbnail-header">
        {logoUrl && <LoadedImage src={logoUrl} className="thumbnail-event-logo" layer="foreground" />}
        {(draft.tournamentName.trim() || draft.headline.trim()) && (
          <div className="thumbnail-heading">
            {draft.tournamentName.trim() && <span data-export-text>{draft.tournamentName}</span>}
            {draft.headline.trim() && <strong data-export-text>{draft.headline}</strong>}
          </div>
        )}
      </header>
      <div className="thumbnail-matchup">
        <ThumbnailPlayer
          key={mediaInteractionKey(draft.players[0], [0, draft.assetCatalogSlug, draft.sourceSetId])}
          editable={editable}
          side="one"
          playerIndex={0}
          player={draft.players[0]}
          mediaMode={draft.mediaMode}
          media={media[0]}
          placement={placements[0]}
          selectedLayer={selectedLayer}
          onSelectLayer={onSelectLayer}
          onPlacementChange={onPlacementChange}
        />
        <div className="thumbnail-versus" data-export-text>
          VS
        </div>
        <ThumbnailPlayer
          key={mediaInteractionKey(draft.players[1], [1, draft.assetCatalogSlug, draft.sourceSetId])}
          editable={editable}
          side="two"
          playerIndex={1}
          player={draft.players[1]}
          mediaMode={draft.mediaMode}
          media={media[1]}
          placement={placements[1]}
          selectedLayer={selectedLayer}
          onSelectLayer={onSelectLayer}
          onPlacementChange={onPlacementChange}
        />
      </div>
      <footer>
        <span data-export-text>JABS broadcast graphic</span>
        <strong data-export-text>{draft.gameName}</strong>
      </footer>
    </section>
  );
}

function ThumbnailPlayer({
  editable,
  side,
  playerIndex,
  player,
  mediaMode,
  media,
  placement,
  selectedLayer,
  onSelectLayer,
  onPlacementChange
}: {
  editable: boolean;
  side: 'one' | 'two';
  playerIndex: 0 | 1;
  player: ThumbnailDraft['players'][number];
  mediaMode: ThumbnailDraft['mediaMode'];
  media: ThumbnailMedia;
  placement: PlayerMediaPlacement;
  selectedLayer?: { player: 0 | 1; layer: MediaLayerKind };
  onSelectLayer(player: 0 | 1, layer: MediaLayerKind): void;
  onPlacementChange(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform): void;
}) {
  const flagUrl = displayFlagUrl(player.country, player.displayFlag);
  const prideFlag = isPrideDisplayFlag(player.displayFlag);
  const flag = flagUrl && (
    <LoadedImage src={flagUrl} className={`thumbnail-country-flag${prideFlag ? ' is-pride' : ''}`} layer="foreground" />
  );
  return (
    <article
      className={`thumbnail-player thumbnail-player-${side}${media.playerPhotoUrl ? ' has-photo' : ''}${media.characterUrl ? ' has-character' : ''}${media.sponsorLogoUrl ? ' has-sponsor' : ''}`}
      data-export-clip
    >
      <div className="thumbnail-subject">
        <PlayerMediaLayers
          mode={mediaMode}
          name={player.name}
          characterUrl={media.characterUrl}
          photoUrl={media.playerPhotoUrl}
          showPhotoPlaceholder={mediaMode !== 'combined'}
          characterClass="thumbnail-character"
          photoClass="thumbnail-player-photo"
          placement={placement}
          selectedLayer={selectedLayer?.player === playerIndex ? selectedLayer.layer : undefined}
          onSelect={editable ? (layer) => onSelectLayer(playerIndex, layer) : undefined}
          onChange={editable ? (layer, transform) => onPlacementChange(playerIndex, layer, transform) : undefined}
        />
      </div>
      <CharacterPortraitStrip
        portraits={media.characterPortraits ?? []}
        className="thumbnail-character-portraits"
        side={side === 'one' ? 'left' : 'right'}
      />
      <div className="thumbnail-identity" data-export-shape="thumbnail-identity">
        {media.sponsorLogoUrl && (
          <LoadedImage src={media.sponsorLogoUrl} className="thumbnail-sponsor-logo" layer="foreground" />
        )}
        {side === 'one' && flag}
        <div className="thumbnail-identity-copy">
          <span className="thumbnail-name-row">
            <ThumbnailName name={player.name} sponsor={player.sponsor} side={side === 'one' ? 'left' : 'right'} />
          </span>
        </div>
        {side === 'two' && flag}
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
  layer?: 'background' | 'subject' | 'foreground';
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
      onLoad={(event) => {
        event.currentTarget.style.removeProperty('display');
      }}
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}
