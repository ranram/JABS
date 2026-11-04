import { useAppearanceStyle, withBroadcastLanguage } from './appearance/AppearanceProvider';
import { DisplayText } from './DisplayText';
import { useTranslation } from 'react-i18next';
import { useState, type CSSProperties } from 'react';
import {
  customScoreboardRegion,
  customScoreboardRegionBounds,
  defaultCustomScoreboardFont,
  type CustomScoreboard,
  type CustomScoreboardRegion,
  type CustomScoreboardRegionId
} from '@shared/customScoreboards';
import { normalizeXHandle } from '@shared/playerLibrary';
import type { PlayerState, SelectedSetState } from '@shared/models';
import { displayFlagLabel, displayFlagUrl, sponsorLine } from './overlayPlayerPresentation';
import { useMatchFormatLabel } from './useMatchFormatLabel';
import { displayPhaseName, matchPlayerName } from '@shared/matchContext';
import { customScoreboardEntrance } from './customScoreboardEntrance';
import { useOverlayEntrance } from './useOverlayEntrance';
import './customScoreboard.css';
import { CustomScoreboardFrame } from './customScoreboard/CustomScoreboardFrame';
import { ScoreboardSponsors, usePlayerSponsorLogo } from './scoreboardSponsors/ScoreboardSponsors';
import { ScoreboardSponsorLogo } from './scoreboardSponsors/ScoreboardSponsorLogo';
import { ScoreboardPlayerPhotos } from './scoreboardPhotos/ScoreboardPlayerPhotos';
import { scoreboardSeed } from './scoreboardDetails/scoreboardSeed';
import { ScoreboardDetailPill, type ScoreboardDetailKind } from './scoreboardDetails/ScoreboardDetails';
import { resolveGameProfile } from '@shared/gameProfiles';
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
  const { t } = useTranslation(['operator', 'common']);
  const appearanceStyle = useAppearanceStyle();
  const sponsorLogos = [usePlayerSponsorLogo('left'), usePlayerSponsorLogo('right')];
  const [photoTopInset, setPhotoTopInset] = useState(0);
  const entranceRef = useOverlayEntrance(
    customScoreboardEntrance,
    animateEntrance && !onMoveRegion,
    true,
    scoreboard.id
  );
  const matchLabel = useMatchFormatLabel(selectedSet);
  const detailProfile = resolveGameProfile(selectedSet?.stylingGameId ?? selectedSet?.gameId);
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
      style: regionStyle(customScoreboardRegion(scoreboard, region), photoTopInset)
    };
  }

  const broadcast = selectedSet?.broadcast;
  const matchContext = [displayPhaseName(selectedSet?.phase), matchLabel, selectedSet?.station]
    .filter(Boolean)
    .join(' · ');
  const editingBounds = editingRegion ? customScoreboardRegionBounds(editingRegion) : undefined;

  function playerElements(player: PlayerState | undefined, side: 'one' | 'two') {
    const playerKey = side === 'one' ? 'playerOne' : 'playerTwo';
    const playerIndex = side === 'one' ? 0 : 1;
    const playerSide = side === 'one' ? 'left' : 'right';
    const sponsorLogo = sponsorLogos[playerIndex];
    const ids = {
      flag: `${playerKey}Flag`,
      sponsorLogo: `${playerKey}SponsorLogo`,
      xHandle: `${playerKey}XHandle`,
      name: `${playerKey}Name`,
      pronouns: `${playerKey}Pronouns`,
      seed: `${playerKey}Seed`,
      score: `${playerKey}Score`
    } as const;
    const flagUrl =
      player && scoreboard.visibility.flags ? displayFlagUrl(player.country, player.displayFlag) : undefined;
    const sponsor = player ? sponsorLine(player) : t('players.fields.prefix');
    const seed = scoreboardSeed(selectedSet, playerIndex, scoreboard.visibility.seeds);
    const rawHandle = normalizeXHandle(player?.xHandle);
    const xHandle = rawHandle ? `@${rawHandle}` : '';
    const values: Array<{
      id: CustomScoreboardRegionId;
      value: string;
      className: string;
      kind?: ScoreboardDetailKind;
    }> = [
      {
        id: ids.xHandle,
        value: scoreboard.visibility.xHandles ? xHandle : '',
        className: ' is-meta is-x-handle',
        kind: 'xHandle'
      },
      {
        id: ids.name,
        value: player?.name
          ? matchPlayerName(player, selectedSet)
          : t(side === 'one' ? 'editor.playerOne' : 'editor.playerTwo'),
        className: ' is-name'
      },
      {
        id: ids.pronouns,
        value: scoreboard.visibility.pronouns ? player?.pronouns || t('editor.pronouns') : '',
        className: ' is-meta',
        kind: 'pronouns'
      },
      {
        id: ids.seed,
        value: seed !== undefined ? t('common:match.seed', { seed }) : '',
        className: ' is-meta',
        kind: 'seed'
      },
      { id: ids.score, value: String(player?.score ?? 0), className: ' is-score' }
    ];
    return (
      <>
        {scoreboard.visibility.sponsors && (sponsorLogo || editingRegion === ids.sponsorLogo) && (
          <span {...regionProps(ids.sponsorLogo, ' custom-scoreboard-element is-sponsor-logo')}>
            {sponsorLogo ? (
              <ScoreboardSponsorLogo
                side={playerSide}
                align={customScoreboardRegion(scoreboard, ids.sponsorLogo).align}
              />
            ) : (
              t('broadcast.logo')
            )}
          </span>
        )}
        {(flagUrl || editingRegion === ids.flag) && scoreboard.visibility.flags && (
          <span
            {...regionProps(ids.flag, ' custom-scoreboard-element is-flag')}
            role="img"
            aria-label={player ? displayFlagLabel(player.country, player.displayFlag) : t('editor.displayFlag')}
          >
            {flagUrl ? <img src={flagUrl} draggable={false} alt="" aria-hidden="true" /> : t('editor.displayFlag')}
          </span>
        )}
        {values.map(({ id, value, className, kind }) => {
          if (!value && editingRegion !== id) return null;
          return (
            <span key={id} {...regionProps(id, ` custom-scoreboard-element${className}${kind ? ' is-detail' : ''}`)}>
              {id === ids.name ? (
                <CustomScoreboardName
                  name={value}
                  sponsor={scoreboard.visibility.sponsors ? sponsor : undefined}
                  side={playerSide}
                  fontSize={scoreboard.typography.nameSize}
                  font={scoreboard.typography.font ?? defaultCustomScoreboardFont}
                />
              ) : kind ? (
                <ScoreboardDetailPill
                  kind={kind}
                  value={value}
                  side={playerSide}
                  themeClass={detailProfile.overlay.themeClass}
                />
              ) : (
                <DisplayText text={value} />
              )}
            </span>
          );
        })}
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
      <CustomScoreboardFrame frameUrl={frameUrl} inset={photoTopInset} />
      <ScoreboardPlayerPhotos
        selectedSet={selectedSet}
        logoUrl={logoUrl}
        animateEntrance={animateEntrance && !onMoveRegion}
        onTopInsetChange={setPhotoTopInset}
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

function regionStyle(region: CustomScoreboardRegion, inset: number): CSSProperties {
  return {
    left: `${region.x / 19.2}%`,
    top: `${(region.y + (region.y < 780 ? inset : 0)) / 10.8}%`,
    width: `${region.width / 19.2}%`,
    height: `${region.height / 10.8}%`,
    justifyContent: region.align === 'left' ? 'flex-start' : region.align === 'right' ? 'flex-end' : 'center',
    textAlign: region.align
  };
}

export const CustomScoreboardCanvas = withBroadcastLanguage(function CustomScoreboardWithSponsors(
  props: CustomScoreboardCanvasProps
) {
  return (
    <ScoreboardSponsors selectedSet={props.selectedSet}>
      <CustomScoreboardCanvasContent {...props} />
    </ScoreboardSponsors>
  );
});
