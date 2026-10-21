import type { CharacterPortrait } from '../../characterPortraits';
import { CatalogImage } from '../CatalogImage';
import { CharacterPortraitStrip } from '../CharacterPortraitStrip';
import playerPlaceholder from '../../assets/player_placeholder.svg';

/** Shared artwork framing for Victory, Spotlight and Player Stats. */
export function ResultArtwork({
  characterUrl,
  photoUrl,
  photoFallbackUrl = playerPlaceholder,
  portraits = [],
  shadow = false
}: {
  characterUrl?: string;
  photoUrl?: string;
  photoFallbackUrl?: string;
  portraits?: CharacterPortrait[];
  shadow?: boolean;
}) {
  return (
    <div className={`victory-hero${characterUrl && photoUrl ? ' has-both' : ''}`} aria-hidden="true">
      {characterUrl && <SubjectArtwork src={characterUrl} kind="character" shadow={shadow} />}
      {photoUrl && <SubjectArtwork src={photoUrl} fallbackSrc={photoFallbackUrl} kind="photo" shadow={shadow} />}
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
  fallbackSrc
}: {
  src: string;
  kind: 'character' | 'photo';
  shadow: boolean;
  fallbackSrc?: string;
}) {
  const className = kind === 'character' ? 'victory-character-art' : 'victory-player-photo';
  const entrance = `victory-${kind}`;
  return (
    <>
      {shadow && (
        <CatalogImage
          className={`${className} victory-shadow`}
          src={src}
          fallbackSrc={fallbackSrc}
          entrance={`${entrance}-shadow`}
        />
      )}
      <CatalogImage className={className} src={src} fallbackSrc={fallbackSrc} entrance={entrance} />
    </>
  );
}
