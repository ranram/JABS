import { ScoreboardPlayerName } from '../ScoreboardPlayerName';
import { useIdentityTextFit } from '../useIdentityTextFit';
import type { CustomScoreboardFontId } from '@shared/customScoreboards';

export function CustomScoreboardName({
  name,
  sponsor,
  side,
  fontSize,
  font
}: {
  name: string;
  sponsor?: string;
  side: 'left' | 'right';
  fontSize: number;
  font: CustomScoreboardFontId;
}) {
  const ref = useIdentityTextFit(JSON.stringify([name, sponsor, side, fontSize, font]), '.custom-scoreboard-identity');
  return (
    <span ref={ref} className="custom-scoreboard-name-fit">
      <span className="custom-scoreboard-identity">
        <ScoreboardPlayerName
          name={name}
          sponsor={sponsor}
          side={side}
          prefixClassName="custom-scoreboard-prefix"
          nameClassName="custom-scoreboard-name-text"
        />
      </span>
    </span>
  );
}
