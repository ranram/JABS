import { CombinedMediaEditor } from '../combinedMedia/CombinedMediaEditor';
import { clampArtworkTransform } from '@shared/artworkFraming';
import type { CharacterPortrait } from '../../characterPortraits';
import { FramedArtworkImage } from './FramedArtworkImage';
import type { MediaLayerKind, MediaTransform, PlayerMediaPlacement } from '@shared/mediaPlacement';
import { CharacterPortraitStrip } from '../CharacterPortraitStrip';
import playerPlaceholder from '../../assets/player_placeholder.svg';

/** Shared artwork framing for Victory, Spotlight and Player Stats. */
export function ResultArtwork({
  characterUrl,
  photoUrl,
  photoFallbackUrl = playerPlaceholder,
  portraits = [],
  shadow = false,
  placement,
  editing
}: {
  characterUrl?: string;
  photoUrl?: string;
  photoFallbackUrl?: string;
  portraits?: CharacterPortrait[];
  shadow?: boolean;
  placement?: PlayerMediaPlacement;
  editing?: {
    selected?: MediaLayerKind;
    label: string;
    onSelect(layer: MediaLayerKind): void;
    onChange(layer: MediaLayerKind, transform: MediaTransform): void;
  };
}) {
  return (
    <div
      className={`victory-hero${characterUrl && photoUrl ? ' has-both' : ''}${placement ? ' has-framing' : ''}`}
      aria-hidden={editing ? undefined : true}
    >
      {editing && placement ? (
        <CombinedMediaEditor
          name={editing.label}
          characterUrl={characterUrl}
          photoUrl={photoUrl}
          characterClass="victory-character-art"
          photoClass="victory-player-photo"
          photoFallback={photoFallbackUrl}
          placement={placement}
          selected={editing.selected}
          onSelect={editing.onSelect}
          onChange={editing.onChange}
          className="artwork-combined-editor"
          clampTransform={clampArtworkTransform}
        />
      ) : (
        <>
          {characterUrl && (
            <SubjectArtwork src={characterUrl} kind="character" shadow={shadow} transform={placement?.character} />
          )}
          {photoUrl && (
            <SubjectArtwork
              src={photoUrl}
              fallbackSrc={photoFallbackUrl}
              kind="photo"
              shadow={shadow}
              transform={placement?.photo}
            />
          )}
        </>
      )}
      {portraits.length > 0 && (
        <CharacterPortraitStrip
          portraits={portraits}
          className="victory-portraits"
          side="left"
          entrance="victory-portraits"
        />
      )}
    </div>
  );
}

function SubjectArtwork({
  src,
  kind,
  shadow,
  fallbackSrc,
  transform
}: {
  src: string;
  kind: 'character' | 'photo';
  shadow: boolean;
  fallbackSrc?: string;
  transform?: MediaTransform;
}) {
  const className = kind === 'character' ? 'victory-character-art' : 'victory-player-photo';
  const entrance = `victory-${kind}`;
  return (
    <>
      {shadow && (
        <FramedArtworkImage
          className={`${className} victory-shadow`}
          src={src}
          fallbackSrc={fallbackSrc}
          entrance={`${entrance}-shadow`}
          transform={transform}
        />
      )}
      <FramedArtworkImage
        className={className}
        src={src}
        fallbackSrc={fallbackSrc}
        entrance={entrance}
        transform={transform}
      />
    </>
  );
}
