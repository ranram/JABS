import type { SelectedSetState } from '@shared/models';
import type { ScoreboardPhotoLayout } from '@shared/scoreboardPhotos';
import { playerCharacters } from '@shared/characterTeams';
import { ScoreboardDetailPill } from './ScoreboardDetails';

export function ScoreboardCharacterNames({
  selectedSet,
  layout,
  themeClass
}: {
  selectedSet: SelectedSetState;
  layout: ScoreboardPhotoLayout;
  themeClass: string;
}) {
  return (
    <aside className="scoreboard-character-names">
      {([selectedSet.playerOne, selectedSet.playerTwo] as const).map((player, index) => {
        const name = playerCharacters(player)[0]?.trim();
        if (!name) return null;
        const side = index === 0 ? 'left' : 'right';
        const [, y, width, height] = layout.sides[side].bounds;
        return (
          <div
            key={side}
            className="scoreboard-character-group"
            data-player-side={side}
            data-entrance={`character-name-${side}`}
            style={{ top: `${(y + height + 6) / 10.8}%`, [side]: 0, width: `${width / 19.2}%` }}
          >
            <ScoreboardDetailPill kind="character" value={name} side={side} themeClass={themeClass} />
          </div>
        );
      })}
    </aside>
  );
}
