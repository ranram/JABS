import { DisplayText } from './DisplayText';

export function ScoreboardPlayerName({
  name,
  sponsor,
  side,
  prefixClassName,
  nameClassName
}: {
  name: string;
  sponsor?: string;
  side: 'left' | 'right';
  prefixClassName?: string;
  nameClassName?: string;
}) {
  return (
    <>
      {sponsor && side === 'left' && (
        <span className={prefixClassName}>
          <DisplayText text={sponsor} />
          <span className="scoreboard-name-separator"> | </span>
        </span>
      )}
      <span className={nameClassName}>
        <DisplayText text={name} />
      </span>
      {sponsor && side === 'right' && (
        <span className={prefixClassName}>
          <span className="scoreboard-name-separator"> | </span>
          <DisplayText text={sponsor} />
        </span>
      )}
    </>
  );
}
