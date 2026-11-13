import { useRef, useState } from 'react';
import { Button, Group, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { MediaTransform } from '@shared/mediaPlacement';
import type { GameId } from '@shared/gameProfiles';
import {
  photoPlacementTransform,
  scoreboardPhotoTop,
  scoreboardPhotoViewport,
  type photoCropViewBox,
  type ScoreboardPhotoLayout,
  type PhotoFraming
} from '@shared/scoreboardPhotos';
import { ScoreboardPhotoSide } from '../scoreboardPhotos/ScoreboardPlayerPhotos';
import type { LoadedScoreboardPhoto } from '../scoreboardPhotos/useScoreboardPhotoMedia';
import { useMediaAdjustment } from '../operator/useMediaAdjustment';
import { useAppearanceStyle } from '../appearance/AppearanceProvider';
import '../operator/adjustableMedia.css';

type Props = {
  photo: LoadedScoreboardPhoto;
  layout: ScoreboardPhotoLayout;
  side: 'left' | 'right';
  framing?: PhotoFraming;
  placement: MediaTransform;
  stylingGameId?: GameId;
  onChange(transform: MediaTransform): void;
  onReset(): void;
  onAutoFrame?(): void;
};

export function PlayerHeadshotPreview(props: Props) {
  const appearanceStyle = useAppearanceStyle();
  const { t } = useTranslation('operator');
  const [editing, setEditing] = useState(false);
  const [x, y, width, height] = props.layout.sides[props.side].bounds;
  const topRoom =
    y - scoreboardPhotoTop(props.photo, props.layout, props.side, props.framing ?? 'contained', props.placement);
  const fitted = {
    top: y - topRoom - (props.framing === 'extendAbove' ? height * 0.2 : 0),
    height: height + topRoom + (props.framing === 'extendAbove' ? height * 0.2 : 0)
  };
  const viewport = useRef(fitted);
  if (!editing) viewport.current = fitted;
  const visible = viewport.current;
  return (
    <Stack gap="xs">
      <svg
        className="headshot-framing-preview"
        style={{
          ...appearanceStyle,
          aspectRatio: width / visible.height,
          maxWidth: (240 * width) / visible.height
        }}
        viewBox={`${x} ${visible.top} ${width} ${visible.height}`}
      >
        <ScoreboardPhotoSide
          side={props.side}
          layout={props.layout}
          stylingGameId={props.stylingGameId}
          photo={props.photo}
          framing={props.framing}
          renderImage={(box) => <AdjustableHeadshot {...props} box={box} onEditingChange={setEditing} />}
        />
        {props.framing === 'extendAbove' && (
          <path
            data-photo-frame-top
            d={`M ${x} ${y} H ${x + width}`}
            fill="none"
            stroke="#fff"
            strokeOpacity={0.7}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </svg>
      <Group justify="center" gap="xs">
        <Button
          size="compact-sm"
          variant="default"
          disabled={!props.onAutoFrame}
          onClick={() => {
            setEditing(false);
            props.onAutoFrame?.();
          }}
        >
          {t('scoreboardPhotos.autoFrame')}
        </Button>
        {props.framing === 'extendAbove' && (
          <Button size="compact-sm" variant="default" onClick={() => setEditing(false)}>
            {t('scoreboardPhotos.fitPreview')}
          </Button>
        )}
        <Button
          size="compact-sm"
          variant="default"
          onClick={() => {
            setEditing(false);
            props.onReset();
          }}
        >
          {t('scoreboardPhotos.reset')}
        </Button>
      </Group>
    </Stack>
  );
}

function AdjustableHeadshot({
  photo,
  placement,
  onChange,
  box,
  layout,
  side,
  framing,
  onEditingChange
}: Props & { box: ReturnType<typeof photoCropViewBox>; onEditingChange(editing: boolean): void }) {
  const { t } = useTranslation('operator');
  const element = useRef<SVGGElement>(null);
  const [selected, setSelected] = useState(false);
  const { dragging, ...controls } = useMediaAdjustment({
    elementRef: element,
    transform: placement,
    selected,
    onSelect: () => setSelected(true),
    onChange,
    interactionKey: JSON.stringify([photo.url, photo.fingerprint, layout.gameId, layout.maskId, side, framing]),
    preview(next) {
      element.current?.setAttribute('transform', photoPlacementTransform(box, next));
      if (framing !== 'extendAbove') return;
      const svg = element.current?.closest<SVGSVGElement>('.headshot-framing-preview');
      if (!svg) return;
      const [, y] = layout.sides[side].bounds;
      const top = scoreboardPhotoTop(photo, layout, side, framing, next);
      const extension = svg.querySelector('[data-photo-extension]');
      extension?.setAttribute('y', String(top));
      extension?.setAttribute('height', String(y - top));
      extension?.closest('mask')?.setAttribute('y', String(Math.min(0, top)));
      extension?.closest('mask')?.setAttribute('height', String(1080 - Math.min(0, top)));
    },
    dragSize(group) {
      const bounds = group.closest('.headshot-framing-preview')!.getBoundingClientRect();
      const { width: panelWidth, height: panelHeight } = scoreboardPhotoViewport(layout, side, framing);
      return {
        width: bounds.width / 2,
        height: framing === 'extendAbove' ? (bounds.width * panelHeight) / panelWidth : bounds.height
      };
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
      onFocus={() => {
        if (framing === 'extendAbove') onEditingChange(true);
        controls.onFocus();
      }}
      onBlur={() => {
        controls.onBlur();
        onEditingChange(false);
      }}
      onPointerDown={(event) => {
        if (framing === 'extendAbove' && event.button === 0 && !event.currentTarget.closest('fieldset[disabled]'))
          onEditingChange(true);
        controls.onPointerDown(event);
      }}
      onKeyDown={(event) => {
        if (
          framing === 'extendAbove' &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          /^(Arrow(Left|Right|Up|Down)|[+=\-_fF])$/.test(event.key)
        )
          onEditingChange(true);
        controls.onKeyDown(event);
      }}
    >
      <image href={photo.url} width={photo.width} height={photo.height} />
    </g>
  );
}
