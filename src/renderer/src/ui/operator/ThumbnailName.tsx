import { ScoreboardPlayerName } from '../ScoreboardPlayerName';
import { useIdentityTextFit } from '../useIdentityTextFit';

export function ThumbnailName({ name, sponsor, side }: { name: string; sponsor?: string; side: 'left' | 'right' }) {
  const ref = useIdentityTextFit(JSON.stringify([name, sponsor, side]), '.thumbnail-name-line');
  return (
    <strong ref={ref} data-export-text="wrapped">
      <span className="thumbnail-name-line">
        <ScoreboardPlayerName
          name={name}
          sponsor={sponsor}
          side={side}
          prefixClassName="thumbnail-sponsor-text"
          nameClassName="thumbnail-name-text"
        />
      </span>
    </strong>
  );
}
