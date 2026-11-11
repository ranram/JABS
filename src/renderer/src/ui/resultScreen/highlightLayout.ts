import type { CSSProperties } from 'react';
import type { HighlightArtworkFrame } from './highlightArtwork';

type Region = { x: number; y: number; width: number; height: number };

export function highlightLayout(
  photo: boolean,
  character: boolean,
  name: boolean,
  characterFrame?: HighlightArtworkFrame
) {
  const top = name ? 220 : 80;
  const height = 1080 - top;
  const photoRegion: Region = { x: 180, y: top, width: 900, height };
  const characterRegion: Region = { x: 840, y: top, width: 900, height };
  if (photo !== character) {
    const subject = photo ? photoRegion : characterRegion;
    subject.width = 1080;
    subject.x = 420;
  }
  const characterWidth = characterRegion.width;
  characterRegion.width *= 1.35;
  characterRegion.height *= 1.35;
  characterRegion.x -= (characterRegion.width - characterWidth) / 2;
  if (characterFrame) {
    const imageHeight = Math.min(characterRegion.height, characterRegion.width / characterFrame.aspectRatio);
    characterRegion.y = (name ? 132 : 64) - characterFrame.top * imageHeight;
  }
  return { photo: photoRegion, character: characterRegion };
}

export function highlightLayoutStyle(layout: ReturnType<typeof highlightLayout>): CSSProperties {
  return Object.fromEntries(
    Object.entries(layout).flatMap(([layer, region]) =>
      Object.entries(region).map(([key, value]) => [`--highlight-${layer}-${key}`, `${value}px`])
    )
  );
}
