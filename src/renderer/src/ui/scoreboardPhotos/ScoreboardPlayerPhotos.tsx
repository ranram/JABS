import { useId, useState, useLayoutEffect, useContext, type ReactNode, type SVGProps } from 'react';
import type { SelectedSetState } from '@shared/models';
import { resolveGameProfile, type GameId } from '@shared/gameProfiles';
import {
  defaultHeadshotCrop,
  photoCropViewBox,
  scoreboardPhotoViewBox,
  photoPlacementTransform,
  scoreboardPhotoPlacement,
  scoreboardPhotoLayout,
  scoreboardPhotoTop,
  type PhotoFraming,
  type PhotoProtectedArea,
  type PhotoShape,
  type ScoreboardPhotoLayout
} from '@shared/scoreboardPhotos';
import { ScoreboardSponsorsContext } from '../scoreboardSponsors/ScoreboardSponsors';
import placeholderUrl from '../../assets/player_placeholder.svg';
import { useScoreboardPhotos } from '../../hooks/useScoreboardPhotos';
import {
  useScoreboardLogoContent,
  useScoreboardPhotoMedia,
  useScoreboardSponsorLogos,
  type LoadedScoreboardPhoto
} from './useScoreboardPhotoMedia';
import { useOverlayEntrance } from '../useOverlayEntrance';
import { scoreboardPhotoEntrance } from './scoreboardPhotoEntrance';
import { scoreboardLogoPlacement, type ScoreboardLogoContent } from './scoreboardLogoBackdrop';
import './scoreboardPlayerPhotos.css';

export function ScoreboardPlayerPhotos({
  selectedSet,
  stylingGameId,
  logoUrl,
  animateEntrance = true,
  onTopInsetChange
}: {
  selectedSet?: SelectedSetState;
  stylingGameId?: GameId;
  logoUrl?: string;
  animateEntrance?: boolean;
  onTopInsetChange?(inset: number): void;
}) {
  const { state } = useScoreboardPhotos();
  const preparedGame =
    selectedSet && (selectedSet.assetCatalogSlug || selectedSet.gameName || selectedSet.setId || selectedSet.eventId);
  const layout = preparedGame && selectedSet ? scoreboardPhotoLayout(selectedSet) : undefined;
  const players = selectedSet
    ? [selectedSet.playerOne, selectedSet.playerTwo].map(({ localPlayerId, playerId, name, playerPhotoAssetId }) => ({
        localPlayerId,
        playerId,
        name,
        playerPhotoAssetId
      }))
    : [];
  const photos = useScoreboardPhotoMedia(players, Boolean(state?.enabled && layout));
  const sharedSponsors = useContext(ScoreboardSponsorsContext);
  const fallbackSponsorUrls = useScoreboardSponsorLogos(
    selectedSet,
    Boolean(!sharedSponsors?.available && state?.enabled && state.sponsorBackdrop && layout)
  );
  const sponsorUrls = sharedSponsors?.available ? sharedSponsors.urls : fallbackSponsorUrls;
  const backdropLogoUrl = state?.enabled && state.logoBackdrop && layout ? logoUrl : undefined;
  const logoUrls = state?.sponsorBackdrop ? sponsorUrls : [backdropLogoUrl, backdropLogoUrl];
  const leftLogoContent = useScoreboardLogoContent(logoUrls[0]);
  const sharedLogo = logoUrls[0] === logoUrls[1];
  const rightLogoContent = useScoreboardLogoContent(sharedLogo ? undefined : logoUrls[1]);
  const entranceRef = useOverlayEntrance<SVGSVGElement>(
    scoreboardPhotoEntrance,
    Boolean(animateEntrance && state?.enabled && layout),
    true,
    layout?.gameId
  );
  const topInset =
    state?.enabled && state.framing === 'extendAbove' && layout
      ? Math.ceil(
          Math.max(
            0,
            ...photos.map((photo, i) => (photo ? -scoreboardPhotoTop(photo, layout, i === 0 ? 'left' : 'right') : 0))
          )
        )
      : 0;
  useLayoutEffect(() => {
    onTopInsetChange?.(topInset);
  }, [onTopInsetChange, topInset]);
  if (!state?.enabled || !layout) return null;
  return (
    <svg
      ref={entranceRef}
      className="scoreboard-player-photos"
      viewBox="0 0 1920 1080"
      style={state.framing === 'extendAbove' ? { top: `${topInset / 10.8}%`, overflow: 'visible' } : undefined}
      data-photo-top-inset={topInset}
      aria-hidden="true"
      focusable="false"
      data-scoreboard-photo-layout={layout.maskId}
    >
      {(['left', 'right'] as const).map((side, i) => (
        <g key={side} className="scoreboard-photo-container" data-entrance={`scoreboard-photo-${side}`}>
          <ScoreboardPhotoSide
            side={side}
            photo={photos[i]}
            framing={state.framing}
            layout={layout}
            stylingGameId={stylingGameId ?? selectedSet?.stylingGameId ?? selectedSet?.gameId}
            logoUrl={logoUrls[i]}
            logoContent={side === 'left' || sharedLogo ? leftLogoContent : rightLogoContent}
          />
        </g>
      ))}
    </svg>
  );
}

function Shape({ shape, ...attributes }: { shape: PhotoShape } & SVGProps<SVGPathElement>) {
  return <path d={shape.path} transform={shape.transform} {...attributes} />;
}
function ProtectedArea({ area }: { area: PhotoProtectedArea }) {
  const [x, y, width, height] = area.bounds;
  return area.shape === 'ellipse' ? (
    <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="black" />
  ) : (
    <rect x={x} y={y} width={width} height={height} fill="black" />
  );
}
export function ScoreboardPhotoSide({
  side,
  photo,
  layout,
  stylingGameId,
  logoUrl,
  logoContent,
  renderImage,
  framing = 'contained'
}: {
  side: 'left' | 'right';
  framing?: PhotoFraming;
  photo?: LoadedScoreboardPhoto;
  layout: ScoreboardPhotoLayout;
  stylingGameId?: GameId;
  logoUrl?: string;
  logoContent?: ScoreboardLogoContent;
  renderImage?(box: ReturnType<typeof photoCropViewBox>): ReactNode;
}) {
  const id = useId().replace(/:/g, '');
  const [failedPhoto, setFailedPhoto] = useState<LoadedScoreboardPhoto>();
  const placeholder = !photo || photo === failedPhoto;
  const image = placeholder ? { url: placeholderUrl, width: 512, height: 512, crop: defaultHeadshotCrop() } : photo;
  const shape = layout.sides[side];
  const [x, y, width, height] = shape.bounds;
  const logoPlacement = scoreboardLogoPlacement(shape.bounds, side, logoContent);
  const palette = resolveGameProfile(stylingGameId ?? layout.gameId).overlay;
  const crop = placeholder
    ? { x: 0, y: 0, width: image.width, height: image.height }
    : scoreboardPhotoViewBox(photo!, width / height);
  const shadowScale = crop.width / width;
  const extendAbove = framing === 'extendAbove' && !placeholder;
  const photoTop = extendAbove ? scoreboardPhotoTop(photo!, layout, side, framing) : y;
  return (
    <g
      data-scoreboard-photo-side={side}
      data-placeholder={placeholder || undefined}
      data-photo-framing={extendAbove ? 'extendAbove' : 'contained'}
    >
      <defs>
        <linearGradient
          id={`${id}-background`}
          gradientUnits="userSpaceOnUse"
          x1={side === 'left' ? x : x + width}
          y1={y}
          x2={side === 'left' ? x + width : x}
          y2={y + height}
        >
          <stop offset="0" stopColor={`color-mix(in srgb, ${palette.background} 88%, black)`} />
          <stop
            offset="1"
            stopColor={`color-mix(in srgb, var(--appearance-primary, ${palette.accent}) 10%, ${palette.background})`}
          />
        </linearGradient>
        <mask
          id={`${id}-photo`}
          maskUnits="userSpaceOnUse"
          x="0"
          y={Math.min(0, photoTop)}
          width="1920"
          height={1080 - Math.min(0, photoTop)}
          style={{ maskType: 'luminance' }}
        >
          <Shape shape={shape} fill="white" />
          {extendAbove && (
            <rect data-photo-extension x={x} y={photoTop} width={width} height={y - photoTop} fill="white" />
          )}
          {layout.protectedAreas.map((area, i) => (
            <ProtectedArea key={i} area={area} />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${id}-photo)`}>
        <Shape shape={shape} fill={`url(#${id}-background)`} data-scoreboard-photo-background />
        {logoUrl && (
          <image data-scoreboard-photo-logo href={logoUrl} {...logoPlacement} preserveAspectRatio="xMidYMid meet" />
        )}
        <svg
          x={x}
          y={y}
          width={width}
          height={height}
          viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
          overflow={extendAbove ? 'visible' : 'hidden'}
          preserveAspectRatio={placeholder ? 'xMidYMid meet' : 'xMidYMid slice'}
        >
          <g
            data-entrance={`scoreboard-photo-${side}-subject`}
            style={{
              filter: `drop-shadow(0 ${5 * shadowScale}px ${7 * shadowScale}px rgb(0 0 0 / 90%)) drop-shadow(0 ${shadowScale}px ${2 * shadowScale}px rgb(0 0 0 / 75%))`
            }}
          >
            {renderImage && !placeholder ? (
              renderImage(crop)
            ) : (
              <g
                transform={
                  placeholder
                    ? undefined
                    : photoPlacementTransform(crop, scoreboardPhotoPlacement(photo!, layout.gameId, side, framing))
                }
              >
                <image
                  href={image.url}
                  x="0"
                  y="0"
                  width={image.width}
                  height={image.height}
                  style={placeholder ? { filter: 'brightness(0) invert(0.55)' } : undefined}
                  onError={() => {
                    if (photo && !placeholder) setFailedPhoto(photo);
                  }}
                />
              </g>
            )}
          </g>
        </svg>
      </g>
    </g>
  );
}
