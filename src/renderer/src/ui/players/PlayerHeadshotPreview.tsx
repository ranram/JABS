import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaTransform } from '@shared/mediaPlacement';
import type { GameId } from '@shared/gameProfiles';
import { photoPlacementTransform, type photoCropViewBox, type ScoreboardPhotoLayout } from '@shared/scoreboardPhotos';
import { ScoreboardPhotoSide } from '../scoreboardPhotos/ScoreboardPlayerPhotos';
import type { LoadedScoreboardPhoto } from '../scoreboardPhotos/useScoreboardPhotoMedia';
import { useMediaAdjustment } from '../operator/useMediaAdjustment';
import { useAppearanceStyle } from '../appearance/AppearanceProvider';
import '../operator/adjustableMedia.css';

type Props = {
  photo: LoadedScoreboardPhoto;
  layout: ScoreboardPhotoLayout;
  side: 'left' | 'right';
  placement: MediaTransform;
  stylingGameId?: GameId;
  onChange(transform: MediaTransform): void;
};

export function PlayerHeadshotPreview(props: Props) {
  const appearanceStyle = useAppearanceStyle();
  const [x, y, width, height] = props.layout.sides[props.side].bounds;
  return (
    <svg
      className="headshot-framing-preview"
      style={{ ...appearanceStyle, aspectRatio: width / height, maxWidth: (240 * width) / height }}
      viewBox={`${x} ${y} ${width} ${height}`}
    >
      <ScoreboardPhotoSide
        side={props.side}
        layout={props.layout}
        stylingGameId={props.stylingGameId}
        photo={props.photo}
        renderImage={(box) => <AdjustableHeadshot {...props} box={box} />}
      />
    </svg>
  );
}

function AdjustableHeadshot({
  photo,
  placement,
  onChange,
  box,
  layout,
  side
}: Props & { box: ReturnType<typeof photoCropViewBox> }) {
  const { t } = useTranslation('operator');
  const element = useRef<SVGGElement>(null);
  const [selected, setSelected] = useState(false);
  const { dragging, ...controls } = useMediaAdjustment({
    elementRef: element,
    transform: placement,
    selected,
    onSelect: () => setSelected(true),
    onChange,
    interactionKey: JSON.stringify([photo.url, photo.fingerprint, layout.gameId, layout.maskId, side]),
    preview(next) {
      element.current?.setAttribute('transform', photoPlacementTransform(box, next));
    },
    dragSize(group) {
      const bounds = group.closest('.headshot-framing-preview')!.getBoundingClientRect();
      return { width: bounds.width / 2, height: bounds.height };
    }
  });
  return (
    <g
      ref={element}
      className={`keyboard-adjustable-media${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      transform={photoPlacementTransform(box, placement)}
      role="img"
      aria-label={t('scoreboardPhotos.preparation')}
      tabIndex={0}
      {...controls}
    >
      <image href={photo.url} width={photo.width} height={photo.height} />
    </g>
  );
}
