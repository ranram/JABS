import { useId, useState, type ReactNode, type SVGProps } from 'react';
import type { SelectedSetState } from '@shared/models';
import { resolveGameProfile, type GameId } from '@shared/gameProfiles';
import {
  defaultHeadshotCrop,
  photoCropViewBox,
  photoPlacementTransform,
  scoreboardPhotoPlacement,
  scoreboardPhotoLayout,
  type PhotoProtectedArea,
  type PhotoShape,
  type ScoreboardPhotoLayout
} from '@shared/scoreboardPhotos';
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
  animateEntrance = true
}: {
  selectedSet?: SelectedSetState;
  stylingGameId?: GameId;
  logoUrl?: string;
  animateEntrance?: boolean;
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
  const sponsorUrls = useScoreboardSponsorLogos(
    selectedSet,
    Boolean(state?.enabled && state.sponsorBackdrop && layout)
  );
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
  if (!state?.enabled || !layout) return null;
  return (
    <svg
      ref={entranceRef}
      className="scoreboard-player-photos"
      viewBox="0 0 1920 1080"
      aria-hidden="true"
      focusable="false"
      data-scoreboard-photo-layout={layout.maskId}
    >
      {(['left', 'right'] as const).map((side, i) => (
        <g key={side} className="scoreboard-photo-container" data-entrance={`scoreboard-photo-${side}`}>
          <ScoreboardPhotoSide
            side={side}
            photo={photos[i]}
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
  renderImage
}: {
  side: 'left' | 'right';
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
    : photoCropViewBox(image.width, image.height, width / height, image.crop);
  const shadowScale = crop.width / width;
  return (
    <g data-scoreboard-photo-side={side} data-placeholder={placeholder || undefined}>
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
          y="0"
          width="1920"
          height="1080"
          style={{ maskType: 'luminance' }}
        >
          <Shape shape={shape} fill="white" />
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
                    : photoPlacementTransform(crop, scoreboardPhotoPlacement(photo!, layout.gameId, side))
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
