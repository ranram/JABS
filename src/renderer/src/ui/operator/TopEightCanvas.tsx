import { type CSSProperties, type ReactNode, type Ref } from 'react';
import type { GameProfile } from '@shared/gameProfiles';
import { topEightMediaBaseScale, type TopEightDraft, type TopEightEntrant } from '@shared/topEight';
import type { MediaLayerKind, MediaTransform, PlayerMediaPlacement } from '@shared/mediaPlacement';
import { defaultPlayerMediaPlacement } from '@shared/mediaPlacement';
import { AdjustableMediaImage } from './AdjustableMediaImage';
import { displayFlagUrl, isPrideDisplayFlag } from '../overlayPlayerPresentation';
import type { CharacterPortrait } from '../../characterPortraits';
import { CharacterPortraitStrip } from '../CharacterPortraitStrip';

export type TopEightEntrantMedia = {
  characterUrl?: string;
  playerPhotoUrl?: string;
  sponsorLogoUrl?: string;
  characterPortraits?: CharacterPortrait[];
};

function topEightFooterText(draft: TopEightDraft): string | undefined {
  const parts: string[] = [];
  if (draft.eventUrl?.trim()) parts.push(draft.eventUrl.trim());
  if (draft.participantCount && draft.participantCount > 0) {
    parts.push(`${draft.participantCount} participants`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function topEightTrustedText(draft: TopEightDraft): string[] {
  // This list must mirror the text actually rendered with data-export-text.
  // Character selection controls artwork and portraits, not visible card text.
  return [
    draft.tournamentName,
    draft.headline,
    draft.gameName,
    ...draft.entrants.flatMap((entrant) => [
      placementText(entrant.placement),
      entrant.sponsor ?? '',
      entrant.name,
      entrant.xHandle ? `@${entrant.xHandle}` : ''
    ]),
    topEightFooterText(draft) ?? ''
  ];
}

type TopEightCanvasProps = {
  draft: TopEightDraft;
  stylingProfile: GameProfile;
  media: TopEightEntrantMedia[];
  logoUrl?: string;
  canvasRef?: Ref<HTMLElement>;
  placements: PlayerMediaPlacement[];
  selectedEntrant?: number;
  onSelectEntrant(index: number): void;
  onPlacementChange(index: number, layer: MediaLayerKind, transform: MediaTransform): void;
};

type TopEightCanvasStyle = CSSProperties & {
  '--top8-accent': string;
  '--top8-background': string;
  '--adjustable-media-outline': string;
};

export function TopEightCanvas({
  draft,
  stylingProfile,
  media,
  logoUrl,
  canvasRef,
  placements,
  selectedEntrant,
  onSelectEntrant,
  onPlacementChange
}: TopEightCanvasProps) {
  const style: TopEightCanvasStyle = {
    '--top8-accent': stylingProfile.overlay.accent,
    '--top8-background': stylingProfile.overlay.background,
    '--adjustable-media-outline': `color-mix(in srgb, ${stylingProfile.overlay.accent} 82%, white)`
  };
  const cards = draft.entrants.map((entrant, index) => (
    <TopEightCard
      key={index}
      index={index}
      entrant={entrant}
      media={media[index]}
      mediaMode={draft.mediaMode}
      style={draft.style}
      placement={placements[index] ?? defaultPlayerMediaPlacement()}
      selected={selectedEntrant === index}
      onSelect={() => onSelectEntrant(index)}
      onPlacementChange={(transform) => onPlacementChange(index, draft.mediaMode, transform)}
    />
  ));

  return (
    <section
      ref={canvasRef}
      className={`top8-canvas top8-${draft.style}`}
      style={style}
      data-top-eight-style={draft.style}
      aria-label={`${draft.headline} · ${draft.tournamentName}`}
    >
      {draft.background && (
        <LoadedImage
          src={draft.background.dataUrl}
          className="top8-custom-background"
          layer="background"
        />
      )}
      <CanvasHeader draft={draft} logoUrl={logoUrl} />
      {draft.style === 'mosaic' && (
        <div className="top8-mosaic-grid">
          {cards.map((card, index) => <div key={index} className={`top8-mosaic-position position-${index + 1}`}>{card}</div>)}
        </div>
      )}
      {draft.style === 'neon' && (
        <>
          <div className="top8-neon-feature">{cards[0]}</div>
          <div className="top8-neon-finalists">{cards.slice(1)}</div>
        </>
      )}
      <CanvasFooter draft={draft} />
    </section>
  );
}

function CanvasFooter({ draft }: { draft: TopEightDraft }) {
  const text = topEightFooterText(draft);
  if (!text) return null;
  return (
    <footer className="top8-canvas-footer">
      <span data-export-text>{text}</span>
    </footer>
  );
}

function CanvasHeader({
  draft,
  logoUrl
}: { draft: TopEightDraft; logoUrl?: string }) {
  return (
    <header className="top8-canvas-header">
      <div className="top8-canvas-title">
        <span data-export-text>{draft.tournamentName}</span>
        <strong data-export-text>{draft.headline}</strong>
      </div>
      <div className="top8-canvas-brand">
        <small data-export-text>{draft.gameName}</small>
        {logoUrl && <LoadedImage src={logoUrl} className="top8-event-logo" layer="foreground" />}
      </div>
    </header>
  );
}

function TopEightCard({
  entrant,
  media,
  mediaMode,
  style,
  placement,
  selected,
  onSelect,
  onPlacementChange
}: {
  index: number;
  entrant: TopEightEntrant;
  media?: TopEightEntrantMedia;
  mediaMode: MediaLayerKind;
  style: TopEightDraft['style'];
  placement: PlayerMediaPlacement;
  selected: boolean;
  onSelect(): void;
  onPlacementChange(transform: MediaTransform): void;
}) {
  const flagUrl = displayFlagUrl(entrant.country, entrant.displayFlag);
  const prideFlag = isPrideDisplayFlag(entrant.displayFlag);
  return (
    <article className={`top8-card placement-${entrant.placement}`} data-export-clip>
      <div className="top8-card-art">
        {media?.characterUrl && (
          <AdjustableMediaImage
            src={media.characterUrl}
            className="top8-character-art"
            label={`${entrant.name} character artwork`}
            transform={placement.character}
            baseScale={topEightMediaBaseScale(style, entrant.placement)}
            selected={selected && mediaMode === 'character'}
            onSelect={onSelect}
            onChange={onPlacementChange}
          />
        )}
        {media?.playerPhotoUrl && (
          <AdjustableMediaImage
            src={media.playerPhotoUrl}
            className="top8-player-photo"
            label={`${entrant.name} player photo`}
            transform={placement.photo}
            baseScale={topEightMediaBaseScale(style, entrant.placement)}
            selected={selected && mediaMode === 'photo'}
            onSelect={onSelect}
            onChange={onPlacementChange}
          />
        )}
      </div>
      <CharacterPortraitStrip
        portraits={media?.characterPortraits ?? []}
        className="top8-character-portraits"
      />
      <div className="top8-card-identity">
        <div className="top8-card-copy" data-export-shape="top8-identity">
          <span className="top8-placement" data-export-text>{placementLabel(entrant.placement)}</span>
          <span
            className={`top8-sponsor-text${entrant.sponsor ? '' : ' is-empty'}`}
            data-export-text={entrant.sponsor ? true : undefined}
            aria-hidden={entrant.sponsor ? undefined : true}
          >
            {entrant.sponsor || '\u00a0'}
          </span>
          <span className="top8-name-row">
            <strong data-export-text>{entrant.name}</strong>
            {flagUrl && <LoadedImage src={flagUrl} className={`top8-country-flag${prideFlag ? ' is-pride' : ''}`} layer="foreground" />}
          </span>
          <span
            className={`top8-x-handle${entrant.xHandle ? '' : ' is-empty'}`}
            data-export-text={entrant.xHandle ? true : undefined}
            aria-hidden={entrant.xHandle ? undefined : true}
          >
            {entrant.xHandle ? `@${entrant.xHandle}` : '\u00a0'}
          </span>
          <span className={`top8-card-meta${media?.sponsorLogoUrl ? '' : ' is-empty'}`} aria-hidden={media?.sponsorLogoUrl ? undefined : true}>
            {media?.sponsorLogoUrl && <LoadedImage src={media.sponsorLogoUrl} className="top8-sponsor-logo" layer="foreground" />}
          </span>
        </div>
      </div>
    </article>
  );
}

function LoadedImage({
  src,
  className,
  layer = 'subject'
}: {
  src: string;
  className: string;
  layer?: 'background' | 'subject' | 'foreground';
}) {
  return (
    <img
      className={`${className} is-loaded`}
      src={src}
      alt=""
      aria-hidden="true"
      data-export-image-layer={layer}
      onLoad={(event) => { event.currentTarget.style.removeProperty('display'); }}
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />
  );
}

function placementLabel(placement: number): ReactNode {
  const suffix = placementSuffix(placement);
  return <>{placement}<sup>{suffix}</sup></>;
}

function placementText(placement: number): string {
  return `${placement}${placementSuffix(placement)}`;
}

function placementSuffix(placement: number): string {
  return placement === 1 ? 'st' : placement === 2 ? 'nd' : placement === 3 ? 'rd' : 'th';
}
