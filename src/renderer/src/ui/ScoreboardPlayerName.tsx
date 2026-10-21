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
          {' | '}
        </span>
      )}
      <span className={nameClassName}>
        <DisplayText text={name} />
      </span>
      {sponsor && side === 'right' && (
        <span className={prefixClassName}>
          {' | '}
          <DisplayText text={sponsor} />
        </span>
      )}
    </>
  );
}
