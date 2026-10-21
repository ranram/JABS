import { useAppearanceStyle, withBroadcastLanguage } from './appearance/AppearanceProvider';
import { DisplayText } from './DisplayText';
import type { CSSProperties } from 'react';
import {
  customScoreboardRegion,
  customScoreboardRegionBounds,
  defaultCustomScoreboardFont,
  type CustomScoreboard,
  type CustomScoreboardRegion,
  type CustomScoreboardRegionId
} from '@shared/customScoreboards';
import type { PlayerState, SelectedSetState } from '@shared/models';
import { displayFlagLabel, displayFlagUrl, sponsorLine } from './overlayPlayerPresentation';
import { useMatchFormatLabel } from './useMatchFormatLabel';
import { displayPhaseName } from '@shared/matchContext';
import { customScoreboardEntrance } from './customScoreboardEntrance';
import { useOverlayEntrance } from './useOverlayEntrance';
import './customScoreboard.css';
import { ScoreboardPlayerPhotos } from './scoreboardPhotos/ScoreboardPlayerPhotos';
import { CustomScoreboardName } from './customScoreboard/CustomScoreboardName';
import { bundledFonts } from './fonts/bundledFonts';
import './operator/generatorFonts.css';
import { useCustomScoreboardEditing } from './customScoreboard/useCustomScoreboardEditing';

type CustomScoreboardCanvasProps = {
  scoreboard: CustomScoreboard;
  frameUrl: string;
  selectedSet?: SelectedSetState;
  logoUrl?: string;
  editingRegion?: CustomScoreboardRegionId;
  editorLabel?: string;
  onSelectRegion?(region: CustomScoreboardRegionId): void;
  onMoveRegion?(region: CustomScoreboardRegionId, x: number, y: number): void;
  animateEntrance?: boolean;
};

function CustomScoreboardCanvasContent({
  scoreboard,
  frameUrl,
  selectedSet,
  logoUrl,
  editingRegion,
  editorLabel,
  onSelectRegion,
  onMoveRegion,
  animateEntrance = false
}: CustomScoreboardCanvasProps) {
  const appearanceStyle = useAppearanceStyle();
  const entranceRef = useOverlayEntrance(
    customScoreboardEntrance,
    animateEntrance && !onMoveRegion,
    true,
    scoreboard.id
  );
  const matchLabel = useMatchFormatLabel(selectedSet);
  const { dragging, ...editing } = useCustomScoreboardEditing({
    scoreboard,
    editingRegion,
    onSelectRegion,
    onMoveRegion
  });
  const style = {
    '--custom-font-family': bundledFonts[scoreboard.typography.font ?? defaultCustomScoreboardFont].family,
    '--custom-text': scoreboard.typography.textColor,
    '--custom-sponsor': scoreboard.typography.sponsorColor ?? scoreboard.typography.textColor,
    '--custom-name-size': `${scoreboard.typography.nameSize / 19.2}cqw`,
    '--custom-meta-size': `${scoreboard.typography.metaSize / 19.2}cqw`,
    '--custom-score-size': `${scoreboard.typography.scoreSize / 19.2}cqw`,
    '--custom-context-size': `${scoreboard.typography.contextSize / 19.2}cqw`
  } as CSSProperties;

  function regionProps(region: CustomScoreboardRegionId, extraClass = '') {
    return {
      'data-entrance': region,
      'data-custom-scoreboard-region': region,
      className: `custom-scoreboard-region${editingRegion === region ? ' is-editing' : ''}${extraClass}`,
      style: regionStyle(customScoreboardRegion(scoreboard, region))
    };
  }

  const broadcast = selectedSet?.broadcast;
  const matchContext = [displayPhaseName(selectedSet?.phase), matchLabel, selectedSet?.station]
    .filter(Boolean)
    .join(' · ');
  const editingBounds = editingRegion ? customScoreboardRegionBounds(editingRegion) : undefined;

  function playerElements(player: PlayerState | undefined, side: 'one' | 'two') {
    const ids =
      side === 'one'
        ? ({
            flag: 'playerOneFlag',
            xHandle: 'playerOneXHandle',
            name: 'playerOneName',
            pronouns: 'playerOnePronouns',
            seed: 'playerOneSeed',
            score: 'playerOneScore'
          } as const)
        : ({
            flag: 'playerTwoFlag',
            xHandle: 'playerTwoXHandle',
            name: 'playerTwoName',
            pronouns: 'playerTwoPronouns',
            seed: 'playerTwoSeed',
            score: 'playerTwoScore'
          } as const);
    const flagUrl =
      player && scoreboard.visibility.flags ? displayFlagUrl(player.country, player.displayFlag) : undefined;
    const sponsor = player ? sponsorLine(player) : 'SPONSOR';
    const xHandle = player?.xHandle ? `@${player.xHandle}` : '';
    const values = [
      { id: ids.xHandle, value: scoreboard.visibility.xHandles ? xHandle : '', className: ' is-meta is-x-handle' },
      { id: ids.name, value: player?.name || `PLAYER ${side === 'one' ? '1' : '2'}`, className: ' is-name' },
      {
        id: ids.pronouns,
        value: scoreboard.visibility.pronouns ? player?.pronouns || 'PRONOUNS' : '',
        className: ' is-meta'
      },
      {
        id: ids.seed,
        value: scoreboard.visibility.seeds ? (player?.seed ? `Seed ${player.seed}` : 'SEED') : '',
        className: ' is-meta'
      },
      { id: ids.score, value: String(player?.score ?? 0), className: ' is-score' }
    ];
    return (
      <>
        {(flagUrl || editingRegion === ids.flag) && scoreboard.visibility.flags && (
          <span
            {...regionProps(ids.flag, ' custom-scoreboard-element is-flag')}
            role="img"
            aria-label={player ? displayFlagLabel(player.country, player.displayFlag) : 'Flag'}
          >
            {flagUrl ? <img src={flagUrl} draggable={false} alt="" aria-hidden="true" /> : 'FLAG'}
          </span>
        )}
        {values.map(
          ({ id, value, className }) =>
            (value || editingRegion === id) && (
              <span key={id} {...regionProps(id, ` custom-scoreboard-element${className}`)}>
                {id === ids.name ? (
                  <CustomScoreboardName
                    name={value}
                    sponsor={scoreboard.visibility.sponsors ? sponsor : undefined}
                    side={side === 'one' ? 'left' : 'right'}
                    fontSize={scoreboard.typography.nameSize}
                    font={scoreboard.typography.font ?? defaultCustomScoreboardFont}
                  />
                ) : (
                  <DisplayText text={value} />
                )}
              </span>
            )
        )}
      </>
    );
  }

  return (
    <section
      ref={entranceRef}
      className={`custom-scoreboard-canvas outline-${scoreboard.typography.outline}${onMoveRegion ? ' is-editable' : ''}${dragging ? ' is-dragging' : ''}`}
      style={{ ...appearanceStyle, ...style }}
      data-custom-scoreboard-id={scoreboard.id}
      tabIndex={onMoveRegion ? 0 : undefined}
      aria-label={onMoveRegion ? editorLabel : undefined}
      {...editing}
    >
      <img
        className="custom-scoreboard-frame"
        src={frameUrl}
        draggable={false}
        data-entrance="custom-frame"
        alt=""
        aria-hidden="true"
      />
      <ScoreboardPlayerPhotos
        selectedSet={selectedSet}
        logoUrl={logoUrl}
        animateEntrance={animateEntrance && !onMoveRegion}
      />
      {editingRegion?.startsWith('playerOne') && <div className="custom-scoreboard-editing-boundary is-one" />}
      {editingRegion?.startsWith('playerTwo') && <div className="custom-scoreboard-editing-boundary is-two" />}
      {editingBounds?.y === 780 && <div className="custom-scoreboard-editing-boundary is-bottom" />}
      {playerElements(selectedSet?.playerOne, 'one')}
      {playerElements(selectedSet?.playerTwo, 'two')}
      {scoreboard.visibility.round && (
        <div {...regionProps('matchLabel', ' custom-scoreboard-context')}>
          <DisplayText text={selectedSet?.round || 'ROUND'} />
        </div>
      )}
      {scoreboard.visibility.tournamentLogo && broadcast?.logoEnabled && logoUrl && (
        <div {...regionProps('logo', ' custom-scoreboard-logo')}>
          <img src={logoUrl} draggable={false} alt="" aria-hidden="true" />
        </div>
      )}
      {(scoreboard.visibility.bottomRails ||
        editingRegion === 'infoLeft' ||
        editingRegion === 'infoCenter' ||
        editingRegion === 'infoRight') && (
        <>
          {((scoreboard.visibility.bottomRails && scoreboard.visibility.infoLeft !== false) ||
            editingRegion === 'infoLeft') && (
            <div {...regionProps('infoLeft', ' custom-scoreboard-context')}>
              <DisplayText text={broadcast?.infoBarEnabled ? (broadcast.infoLeft ?? '') : ''} />
            </div>
          )}
          {((scoreboard.visibility.bottomRails && scoreboard.visibility.infoCenter !== false) ||
            editingRegion === 'infoCenter') && (
            <div {...regionProps('infoCenter', ' custom-scoreboard-context')}>
              <DisplayText text={matchContext} />
            </div>
          )}
          {((scoreboard.visibility.bottomRails && scoreboard.visibility.infoRight !== false) ||
            editingRegion === 'infoRight') && (
            <div {...regionProps('infoRight', ' custom-scoreboard-context')}>
              <DisplayText text={broadcast?.infoBarEnabled ? (broadcast.infoRight ?? '') : ''} />
            </div>
          )}
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

export const CustomScoreboardCanvas = withBroadcastLanguage(CustomScoreboardCanvasContent);
