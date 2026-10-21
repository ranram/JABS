import type { MediaLayerKind, MediaTransform, PlayerMediaMode, PlayerMediaPlacement } from '@shared/mediaPlacement';
import { mediaMirrorX } from '@shared/mediaPlacement';
import { AdjustableMediaImage } from './operator/AdjustableMediaImage';
import { CombinedMediaEditor } from './combinedMedia/CombinedMediaEditor';
import { CatalogImage } from './CatalogImage';
import { mediaTransformCss, type MediaCoordinateSpace } from './mediaTransformCss';
import playerPlaceholder from '../assets/player_placeholder.svg';
import './playerMediaLayers.css';

type PlayerMediaLayersProps = {
  mode: PlayerMediaMode;
  name: string;
  characterUrl?: string;
  photoUrl?: string;
  photoReady?: boolean;
  showPhotoPlaceholder?: boolean;
  characterClass: string;
  photoClass: string;
  placement: PlayerMediaPlacement;
  baseScale?: number;
  coordinateSpace?: MediaCoordinateSpace;
  characterEntrance?: string;
  photoEntrance?: string;
  selectedLayer?: MediaLayerKind;
  onSelect?(layer: MediaLayerKind): void;
  onChange?(layer: MediaLayerKind, transform: MediaTransform): void;
};

/** Keep separate positions and sizes for each image, with the photo in front. */
export function PlayerMediaLayers({
  mode,
  name,
  characterUrl,
  photoUrl,
  photoReady = true,
  showPhotoPlaceholder = true,
  characterClass,
  photoClass,
  placement,
  baseScale = 1,
  coordinateSpace = 'preview',
  characterEntrance,
  photoEntrance,
  selectedLayer,
  onSelect,
  onChange
}: PlayerMediaLayersProps) {
  const character = mode !== 'photo' ? characterUrl : undefined;
  const fallbackPhoto = photoReady && showPhotoPlaceholder ? playerPlaceholder : undefined;
  const photo = mode !== 'character' ? (photoUrl ?? fallbackPhoto) : undefined;
  const classes = `player-media-layers${mode === 'combined' ? ' is-combined' : ''}${character ? ' has-character' : ''}`;
  const characterClasses = `${characterClass} player-media-character`;
  if (mode === 'combined' && onSelect && onChange) {
    return (
      <CombinedMediaEditor
        key={JSON.stringify([name, character, photo])}
        name={name}
        characterUrl={character}
        photoUrl={photo}
        characterClass={characterClass}
        photoClass={photoClass}
        photoFallback={showPhotoPlaceholder ? playerPlaceholder : undefined}
        placement={placement}
        selected={selectedLayer}
        onSelect={onSelect}
        onChange={onChange}
      />
    );
  }
  return (
    <div className={classes}>
      {character &&
        (onSelect && onChange ? (
          <AdjustableMediaImage
            src={character}
            className={characterClasses}
            label={`${name} character artwork`}
            transform={placement.character}
            baseScale={baseScale}
            selected={selectedLayer === 'character'}
            onSelect={() => onSelect('character')}
            onChange={(next) => onChange('character', next)}
          />
        ) : (
          <CatalogImage
            src={character}
            className={characterClasses}
            entrance={characterEntrance}
            style={{
              transform: mediaTransformCss(
                placement.character,
                mediaMirrorX(false, placement.character),
                baseScale,
                coordinateSpace
              )
            }}
          />
        ))}
      {photo &&
        (mode === 'photo' && onSelect && onChange ? (
          <AdjustableMediaImage
            src={photo}
            fallbackSrc={showPhotoPlaceholder ? playerPlaceholder : undefined}
            className={`${photoClass} player-media-photo`}
            label={`${name} player photo`}
            transform={placement.photo}
            baseScale={baseScale}
            selected={selectedLayer === 'photo'}
            onSelect={() => onSelect('photo')}
            onChange={(next) => onChange('photo', next)}
          />
        ) : (
          <CatalogImage
            src={photo}
            fallbackSrc={showPhotoPlaceholder ? playerPlaceholder : undefined}
            className={`${photoClass} player-media-photo`}
            entrance={photoEntrance}
            style={{
              transform: mediaTransformCss(
                placement.photo,
                mediaMirrorX(false, placement.photo),
                mode === 'photo' ? baseScale : 1,
                coordinateSpace
              )
            }}
          />
        ))}
    </div>
  );
}
