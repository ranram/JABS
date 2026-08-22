import type { CharacterPortrait } from '../characterPortraits';

export function CharacterPortraitStrip({
  portraits,
  className,
  side
}: {
  portraits: readonly CharacterPortrait[];
  className: string;
  side?: 'left' | 'right';
}) {
  if (portraits.length === 0) return null;
  return (
    <div className={`${className}${side ? ` is-${side}` : ''}`} aria-label="Selected character portraits">
      {portraits.map(({ character, url }) => (
        <img
          key={character}
          src={url}
          alt=""
          title={character}
          aria-hidden="true"
          data-export-image-layer="foreground"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      ))}
    </div>
  );
}
