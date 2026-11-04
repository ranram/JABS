import { useState } from 'react';
import { useScoreboardLogoContent } from '../scoreboardPhotos/useScoreboardPhotoMedia';
import { usePlayerSponsorLogo } from './ScoreboardSponsors';
import './scoreboardSponsorLogo.css';

export function ScoreboardSponsorLogo({
  side,
  align
}: {
  side: 'left' | 'right';
  align?: 'left' | 'center' | 'right';
}) {
  const url = usePlayerSponsorLogo(side);
  const content = useScoreboardLogoContent(url);
  const [failedUrl, setFailedUrl] = useState<string>();
  if (!url || !content || failedUrl === url) return null;
  const sourceAspect = (content.aspectRatio * content.height) / content.width;
  const alignment = align ?? (side === 'left' ? 'right' : 'left');
  const anchor = { left: 'xMin', center: 'xMid', right: 'xMax' }[alignment];
  return (
    <svg
      className="scoreboard-sponsor-logo"
      data-player-side={side}
      viewBox={`${content.x * sourceAspect} ${content.y} ${content.width * sourceAspect} ${content.height}`}
      preserveAspectRatio={`${anchor}YMid meet`}
      aria-hidden="true"
      focusable="false"
    >
      <image href={url} width={sourceAspect} height={1} preserveAspectRatio="none" onError={() => setFailedUrl(url)} />
    </svg>
  );
}
