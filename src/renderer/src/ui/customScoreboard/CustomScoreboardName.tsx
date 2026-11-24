import { ScoreboardPlayerName } from '../ScoreboardPlayerName';
import { useIdentityTextFit } from '../useIdentityTextFit';
import { useAppearance } from '../appearance/AppearanceProvider';

export function CustomScoreboardName({
  name,
  sponsor,
  side,
  fontSize,
  fontFamily
}: {
  name: string;
  sponsor?: string;
  side: 'left' | 'right';
  fontSize: number;
  fontFamily: string;
}) {
  const { state: { scoreboardTextScale } } = useAppearance();
  const ref = useIdentityTextFit(
    JSON.stringify([name, sponsor, side, fontSize, fontFamily, scoreboardTextScale]),
    '.custom-scoreboard-identity'
  );
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
