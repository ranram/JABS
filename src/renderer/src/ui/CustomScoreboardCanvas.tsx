import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import {
  customScoreboardRegion,
  customScoreboardRegionBounds,
  type CustomScoreboard,
  type CustomScoreboardRegion,
  type CustomScoreboardRegionId
} from '@shared/customScoreboards';
import type { PlayerState, SelectedSetState } from '@shared/models';
import { displayFlagLabel, displayFlagUrl } from './overlayPlayerPresentation';
import './customScoreboard.css';

type CustomScoreboardCanvasProps = {
  scoreboard: CustomScoreboard;
  frameUrl: string;
  selectedSet?: SelectedSetState;
  logoUrl?: string;
  editingRegion?: CustomScoreboardRegionId;
  editorLabel?: string;
  onMoveRegion?(region: CustomScoreboardRegionId, x: number, y: number): void;
};

type DragState = {
  region: CustomScoreboardRegionId;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
};

export function CustomScoreboardCanvas({
  scoreboard, frameUrl, selectedSet, logoUrl, editingRegion, editorLabel, onMoveRegion
}: CustomScoreboardCanvasProps) {
  const drag = useRef<DragState | undefined>(undefined);
  const style = {
    '--custom-text': scoreboard.typography.textColor,
    '--custom-name-size': `${scoreboard.typography.nameSize / 19.2}cqw`,
    '--custom-meta-size': `${scoreboard.typography.metaSize / 19.2}cqw`,
    '--custom-score-size': `${scoreboard.typography.scoreSize / 19.2}cqw`,
    '--custom-context-size': `${scoreboard.typography.contextSize / 19.2}cqw`
  } as CSSProperties;

  function beginDrag(event: PointerEvent<HTMLElement>, region: CustomScoreboardRegionId) {
    if (editingRegion !== region || !onMoveRegion) return;
    const current = customScoreboardRegion(scoreboard, region);
    drag.current = { region, pointerX: event.clientX, pointerY: event.clientY, x: current.x, y: current.y };
    event.currentTarget.closest<HTMLElement>('.custom-scoreboard-canvas')?.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (!editingRegion || !onMoveRegion) return;
    const movement = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    const current = customScoreboardRegion(scoreboard, editingRegion);
    const allowed = customScoreboardRegionBounds(editingRegion);
    const step = event.shiftKey ? 10 : 1;
    onMoveRegion(
      editingRegion,
      Math.max(allowed.x, Math.min(
        allowed.x + allowed.width - current.width,
        current.x + movement[0] * step
      )),
      Math.max(allowed.y, Math.min(
        allowed.y + allowed.height - current.height,
        current.y + movement[1] * step
      ))
    );
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    const canvas = event.currentTarget.closest<HTMLElement>('.custom-scoreboard-canvas');
    if (!current || !canvas || !onMoveRegion) return;
    const bounds = canvas.getBoundingClientRect();
    const region = customScoreboardRegion(scoreboard, current.region);
    const allowed = customScoreboardRegionBounds(current.region);
    const x = Math.round(current.x + (event.clientX - current.pointerX) * 1920 / bounds.width);
    const y = Math.round(current.y + (event.clientY - current.pointerY) * 1080 / bounds.height);
    onMoveRegion(
      current.region,
      Math.max(allowed.x, Math.min(allowed.x + allowed.width - region.width, x)),
      Math.max(allowed.y, Math.min(allowed.y + allowed.height - region.height, y))
    );
  }

  function regionProps(region: CustomScoreboardRegionId, extraClass = '') {
    return {
      className: `custom-scoreboard-region${editingRegion === region ? ' is-editing' : ''}${extraClass}`,
      style: regionStyle(customScoreboardRegion(scoreboard, region)),
      onPointerDown: (event: PointerEvent<HTMLElement>) => beginDrag(event, region),
      onPointerMove: moveDrag,
      onPointerUp: () => { drag.current = undefined; },
      onPointerCancel: () => { drag.current = undefined; }
    };
  }

  const broadcast = selectedSet?.broadcast;
  const matchContext = [
    selectedSet?.phase,
    selectedSet?.phaseGroup,
    selectedSet ? `Best of ${selectedSet.bestOf}` : 'BEST OF 3',
    selectedSet?.station
  ].filter(Boolean).join(' · ');
  const editingBounds = editingRegion ? customScoreboardRegionBounds(editingRegion) : undefined;

  function playerElements(player: PlayerState | undefined, side: 'one' | 'two') {
    const ids = side === 'one' ? {
      flag: 'playerOneFlag', sponsor: 'playerOneSponsor', name: 'playerOneName',
      pronouns: 'playerOnePronouns', seed: 'playerOneSeed', score: 'playerOneScore'
    } as const : {
      flag: 'playerTwoFlag', sponsor: 'playerTwoSponsor', name: 'playerTwoName',
      pronouns: 'playerTwoPronouns', seed: 'playerTwoSeed', score: 'playerTwoScore'
    } as const;
    const flagUrl = player && scoreboard.visibility.flags
      ? displayFlagUrl(player.country, player.displayFlag)
      : undefined;
    const sponsor = player
      ? [...new Set([player.prefix, player.sponsor].filter(Boolean))].join(' · ')
      : 'SPONSOR';
    const values = [
      { id: ids.sponsor, value: scoreboard.visibility.sponsors ? sponsor : '', className: ' is-meta' },
      { id: ids.name, value: player?.name || `PLAYER ${side === 'one' ? '1' : '2'}`, className: ' is-name' },
      { id: ids.pronouns, value: scoreboard.visibility.pronouns ? player?.pronouns || 'PRONOUNS' : '', className: ' is-meta' },
      { id: ids.seed, value: scoreboard.visibility.seeds ? player?.seed ? `Seed ${player.seed}` : 'SEED' : '', className: ' is-meta' },
      { id: ids.score, value: String(player?.score ?? 0), className: ' is-score' }
    ];
    return (
      <>
        {(flagUrl || editingRegion === ids.flag) && scoreboard.visibility.flags && (
          <span {...regionProps(ids.flag, ' custom-scoreboard-element is-flag')} role="img"
            aria-label={player ? displayFlagLabel(player.country, player.displayFlag) : 'Flag'}>
            {flagUrl ? <img src={flagUrl} alt="" aria-hidden="true" /> : 'FLAG'}
          </span>
        )}
        {values.map(({ id, value, className }) => (value || editingRegion === id) && (
          <span key={id} {...regionProps(id, ` custom-scoreboard-element${className}`)}>{value}</span>
        ))}
      </>
    );
  }

  return (
    <section
      className={`custom-scoreboard-canvas outline-${scoreboard.typography.outline}`}
      style={style}
      data-custom-scoreboard-id={scoreboard.id}
      tabIndex={editingRegion && onMoveRegion ? 0 : undefined}
      aria-label={editingRegion ? editorLabel : undefined}
      onKeyDown={moveWithKeyboard}
    >
      <img className="custom-scoreboard-frame" src={frameUrl} alt="" aria-hidden="true" />
      {editingRegion?.startsWith('playerOne') && <div className="custom-scoreboard-editing-boundary is-one" />}
      {editingRegion?.startsWith('playerTwo') && <div className="custom-scoreboard-editing-boundary is-two" />}
      {editingBounds?.y === 780 && <div className="custom-scoreboard-editing-boundary is-bottom" />}
      {playerElements(selectedSet?.playerOne, 'one')}
      {playerElements(selectedSet?.playerTwo, 'two')}
      {scoreboard.visibility.round && (
        <div {...regionProps('matchLabel', ' custom-scoreboard-context')}>
          {selectedSet?.round || 'ROUND'}
        </div>
      )}
      {scoreboard.visibility.tournamentLogo && broadcast?.logoEnabled && logoUrl && (
        <div {...regionProps('logo', ' custom-scoreboard-logo')}>
          <img src={logoUrl} alt="" aria-hidden="true" />
        </div>
      )}
      {scoreboard.visibility.bottomRails && (
        <>
          <div {...regionProps('infoLeft', ' custom-scoreboard-context')}>
            {broadcast?.infoBarEnabled ? broadcast.infoLeft : ''}
          </div>
          <div {...regionProps('infoCenter', ' custom-scoreboard-context')}>
            {matchContext}
          </div>
          <div {...regionProps('infoRight', ' custom-scoreboard-context')}>
            {broadcast?.infoBarEnabled ? broadcast.infoRight : ''}
          </div>
        </>
      )}
    </section>
  );
}

function regionStyle(region: CustomScoreboardRegion): CSSProperties {
  return {
    left: `${region.x / 19.2}%`,
    top: `${region.y / 10.8}%`,
    width: `${region.width / 19.2}%`,
    height: `${region.height / 10.8}%`,
    justifyContent: region.align === 'left' ? 'flex-start' : region.align === 'right' ? 'flex-end' : 'center',
    textAlign: region.align
  };
}
