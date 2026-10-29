import { useAppearance, useAppearanceStyle } from './appearance/AppearanceProvider';
import { useScoreboardContrast } from './appearance/useScoreboardContrast';
import { DisplayText } from './DisplayText';
import { BracketScreen } from './BracketScreen';
import { isBracketOverlayPath } from './overlayPresentation';
import { useScoreboardTextFit } from './useScoreboardTextFit';
import type { ComponentType, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveGameProfile, type GameProfile, type OverlayTemplateId } from '@shared/gameProfiles';
import type { PlayerState, SelectedSetState } from '@shared/models';
import { matchPlayerName } from '@shared/matchContext';
import { useOverlayState } from '../hooks/useOverlayState';
import { useCommentatorState } from '../hooks/useCommentatorState';
import { useBroadcastLogo } from '../hooks/useBroadcastLogo';
import {
  announcementSurfaceFromOverlayPath,
  isCommentatorOverlayPath,
  isTopEightMatchupsOverlayPath,
  isVersusOverlayPath,
  resolveOverlayPresentation
} from './overlayPresentation';
import { VersusOverlay } from './VersusOverlay';
import { PlayerStatsOverlay } from './playerStats/PlayerStatsOverlay';
import { isPlayerStatsOverlayPath } from './overlayPresentation';
import { TopEightMatchupsOverlay } from './TopEightMatchupsOverlay';
import { displayFlagLabel, displayFlagUrl, sponsorLine } from './overlayPlayerPresentation';
import { ScoreboardPlayerName } from './ScoreboardPlayerName';
import { useLogoAssetUrl } from '../hooks/useLogoAssetUrl';
import { BroadcastLayer, MatchChip } from './ScoreOverlayContext';
import { CustomScoreboardCanvas } from './CustomScoreboardCanvas';
import { useCustomScoreboard } from '../hooks/useCustomScoreboard';
import './commentatorOverlay.css';
import './operator/generatorFonts.css';
import { useOverlayEntrance } from './useOverlayEntrance';
import { scoreboardEntrance } from './scoreboardEntrance';
import { AnnouncementOverlay } from './AnnouncementOverlay';
import { CatalogImage } from './CatalogImage';
import { StingersOverlay } from './stingers/StingersOverlay';
import { ScoreboardPlayerPhotos } from './scoreboardPhotos/ScoreboardPlayerPhotos';
import { bundledFonts } from './fonts/bundledFonts';
import './fonts/scoreboardFontOverride.css';

type OverlayTemplateProps = {
  profile: GameProfile;
  selectedSet: SelectedSetState;
};

const overlayTemplates: Record<OverlayTemplateId, ComponentType<OverlayTemplateProps>> = {
  'sf6-drive': TopHudOverlay,
  'tekken-engager': TopHudOverlay,
  'avatar-bending': TopHudOverlay,
  'tokon-assemble': TopHudOverlay,
  'strive-daredevil': TopHudOverlay,
  '2xko-duo': TournamentRibbonOverlay,
  'blazblue-astral': TournamentRibbonOverlay,
  'cotw-rev': TournamentRibbonOverlay,
  'granblue-skybound': TournamentRibbonOverlay,
  'kof-max': TournamentRibbonOverlay,
  'melty-moon': TournamentRibbonOverlay,
  'mk1-brutality': TournamentRibbonOverlay,
  'umvc3-hyper': TournamentRibbonOverlay,
  'smash-stock': TournamentRibbonOverlay,
  'under-night-grd': TournamentRibbonOverlay
};

export function OverlayView() {
  if (window.location.pathname === '/overlay/stingers') return <StingersOverlay />;
  if (isBracketOverlayPath(window.location.pathname)) return <BracketScreen />;
  if (isCommentatorOverlayPath(window.location.pathname)) return <CommentatorOverlay />;
  if (isVersusOverlayPath(window.location.pathname)) return <VersusOverlay />;
  if (isPlayerStatsOverlayPath(window.location.pathname)) return <PlayerStatsOverlay />;
  if (isTopEightMatchupsOverlayPath(window.location.pathname)) return <TopEightMatchupsOverlay />;
  return <MatchOverlayView />;
}

function MatchOverlayView() {
  const appearanceStyle = useAppearanceStyle();
  const {
    state: { scoreboardFont },
    appearance
  } = useAppearance();
  const { t } = useTranslation(['overlay', 'common']);
  const { state, error } = useOverlayState();
  const selectedSet = state?.selectedSet;
  const announcementSurface = announcementSurfaceFromOverlayPath(window.location.pathname);
  const entranceRef = useOverlayEntrance(
    scoreboardEntrance,
    Boolean(selectedSet && !announcementSurface && !selectedSet.customScoreboardId)
  );
  const presentation = resolveOverlayPresentation(
    announcementSurface ? '/overlay/active/main' : window.location.pathname,
    selectedSet?.stylingGameId ?? selectedSet?.gameId
  );
  if (!presentation) {
    return (
      <main className="overlay overlay-route-error" role="alert">
        <div>
          <strong>{t('invalidTitle')}</strong>
          <span>{t('invalidBody')}</span>
        </div>
      </main>
    );
  }
  const profile = resolveGameProfile(presentation.gameId);
  const Template = overlayTemplates[presentation.template];
  const logoUrl = useLogoAssetUrl(selectedSet?.broadcast?.logoAssetId);
  const customScoreboard = useCustomScoreboard(selectedSet?.customScoreboardId, selectedSet?.customScoreboardRevision);
  useScoreboardContrast(
    entranceRef,
    appearance.colorOverride &&
      Boolean(selectedSet && !announcementSurface && !(customScoreboard.scoreboard && customScoreboard.frameUrl)),
    JSON.stringify([
      profile.id,
      appearance.primaryColor,
      appearance.secondaryColor,
      Boolean(selectedSet && sponsorLine(selectedSet.playerOne)),
      Boolean(selectedSet && sponsorLine(selectedSet.playerTwo)),
      selectedSet?.broadcast?.infoBarEnabled
    ])
  );

  if (!selectedSet) {
    return (
      <main className={`overlay overlay-loading ${profile.overlay.themeClass}`}>
        <span>{t('waiting')}</span>
      </main>
    );
  }

  if (announcementSurface) {
    return <AnnouncementOverlay profile={profile} selectedSet={selectedSet} reconnecting={Boolean(error)} />;
  }

  if (customScoreboard.scoreboard && customScoreboard.frameUrl) {
    return (
      <main className="overlay" data-custom-scoreboard-id={customScoreboard.scoreboard.id}>
        <CustomScoreboardCanvas
          animateEntrance
          scoreboard={customScoreboard.scoreboard}
          frameUrl={customScoreboard.frameUrl}
          selectedSet={selectedSet}
          logoUrl={logoUrl}
        />
        {error && (
          <div className="overlay-connection-status" role="status">
            {t('common:status.reconnecting')}
          </div>
        )}
      </main>
    );
  }

  return (
    <main
      ref={entranceRef}
      className={`overlay ${profile.overlay.themeClass}`}
      style={
        {
          ...appearanceStyle,
          ...(scoreboardFont ? { '--scoreboard-font-family': bundledFonts[scoreboardFont].family } : {})
        } as CSSProperties
      }
      data-scoreboard-font={scoreboardFont}
      data-game-id={profile.id}
      data-overlay-template={profile.overlay.template}
    >
      <ScoreboardPlayerPhotos selectedSet={selectedSet} stylingGameId={profile.id} logoUrl={logoUrl} />
      <Template profile={profile} selectedSet={selectedSet} />
      <BroadcastLayer profile={profile} selectedSet={selectedSet} logoUrl={logoUrl} />
      {error && (
        <div className="overlay-connection-status" role="status">
          {t('common:status.reconnecting')}
        </div>
      )}
    </main>
  );
}

function CommentatorOverlay() {
  const { appearance } = useAppearance();
  const appearanceStyle = useAppearanceStyle();
  const { state, error } = useCommentatorState();
  const logoAssetId = useBroadcastLogo(state?.logoAssetId);
  const logoUrl = useLogoAssetUrl(logoAssetId);
  if (!state || state.presentation === 'hidden') return <main className="overlay commentator-overlay" />;
  const stylingProfile = resolveGameProfile(state.stylingGameId);
  return (
    <main
      className={`overlay commentator-overlay ${stylingProfile.overlay.themeClass}`}
      style={appearanceStyle}
      data-overlay-animations={appearance.entranceAnimations}
    >
      <section
        key={state.updatedAt}
        className={`commentator-lower-third is-${state.presentation}`}
        aria-label="Commentators"
      >
        <CommentatorIdentity side="left" {...state.commentators[0]} />
        <div className="commentator-event-mark">
          {logoUrl && <CatalogImage className="commentator-event-logo" src={logoUrl} />}
          <span>
            <DisplayText text={state.tournamentName} />
          </span>
        </div>
        <CommentatorIdentity side="right" {...state.commentators[1]} />
      </section>
      {error && (
        <div className="overlay-connection-status" role="status">
          {error}
        </div>
      )}
    </main>
  );
}

function CommentatorIdentity({ side, name, handle }: { side: 'left' | 'right'; name: string; handle: string }) {
  return (
    <div className={`commentator-identity commentator-identity-${side}`}>
      <strong>
        <DisplayText text={name} />
      </strong>
      {handle && (
        <span>
          <DisplayText text={handle} />
        </span>
      )}
    </div>
  );
}

const frameClasses: Partial<Record<OverlayTemplateId, string>> = {
  'sf6-drive': 'sf6-frame',
  'tekken-engager': 'tekken-frame',
  'avatar-bending': 'avatar-legends-frame',
  'strive-daredevil': 'strive-frame',
  'tokon-assemble': 'tokon-frame'
};

function TopHudOverlay({ profile, selectedSet }: OverlayTemplateProps) {
  return (
    <section
      className={`overlay-frame top-hud-frame ${frameClasses[profile.overlay.template]}`}
      style={topHudStyle(profile)}
    >
      <PlayerPlate player={selectedSet.playerOne} selectedSet={selectedSet} side="left" profile={profile} />
      <MatchChip profile={profile} selectedSet={selectedSet} />
      <PlayerPlate player={selectedSet.playerTwo} selectedSet={selectedSet} side="right" profile={profile} />
    </section>
  );
}

function TournamentRibbonOverlay({ profile, selectedSet }: OverlayTemplateProps) {
  return (
    <section
      className={`overlay-frame top-hud-frame tournament-ribbon-frame ${profile.overlay.template}-frame`}
      style={topHudStyle(profile)}
    >
      <PlayerPlate player={selectedSet.playerOne} selectedSet={selectedSet} side="left" profile={profile} />
      {profile.overlay.showMatchChip === false ? (
        <div className="overlay-hud-clear" aria-hidden="true" />
      ) : (
        <MatchChip profile={profile} selectedSet={selectedSet} />
      )}
      <PlayerPlate player={selectedSet.playerTwo} selectedSet={selectedSet} side="right" profile={profile} />
    </section>
  );
}

type PlayerPlateProps = {
  player: PlayerState;
  selectedSet: SelectedSetState;
  side: 'left' | 'right';
  profile: GameProfile;
};

function PlayerPlate({ player, selectedSet, side, profile }: PlayerPlateProps) {
  const { t } = useTranslation(['overlay', 'common']);
  const name = matchPlayerName(player, selectedSet);
  const sponsor = sponsorLine(player);
  const showSeed = Boolean(selectedSet.setId) && selectedSet.broadcast?.seedsEnabled !== false;
  const details = showSeed && player.seed !== undefined ? t('common:match.seed', { seed: player.seed }) : undefined;
  const flagUrl = displayFlagUrl(player.country, player.displayFlag);
  const xHandle = player.xHandle ? `@${player.xHandle}` : undefined;
  const copyRef = useScoreboardTextFit({
    name,
    sponsor,
    details,
    pronouns: player.pronouns,
    xHandle,
    themeId: profile.id
  });

  return (
    <article
      data-entrance={`player-${side}`}
      className={`overlay-player overlay-player-${side}${flagUrl ? ' has-country-flag' : ''}`}
    >
      {flagUrl && (
        <span
          className="overlay-player-flag"
          role="img"
          aria-label={displayFlagLabel(player.country, player.displayFlag)}
        >
          <img src={flagUrl} alt="" aria-hidden="true" />
        </span>
      )}
      <div className="overlay-player-copy" ref={copyRef}>
        <span className="overlay-player-identity">
          <strong className="overlay-player-name">
            <ScoreboardPlayerName
              name={name}
              sponsor={sponsor}
              side={side}
              prefixClassName="overlay-player-prefix"
              nameClassName="overlay-player-name-text"
            />
          </strong>
        </span>
        {(xHandle || player.pronouns || details) && (
          <span className="overlay-player-meta">
            {xHandle && (
              <span className="overlay-player-x-handle">
                <DisplayText text={xHandle} />
              </span>
            )}
            {player.pronouns && (
              <span className="overlay-player-pronouns">
                <DisplayText text={player.pronouns} />
              </span>
            )}
            {details && (
              <span className="overlay-player-details">
                <DisplayText text={details} />
              </span>
            )}
          </span>
        )}
      </div>
      <span
        className="overlay-player-score"
        aria-label={t('overlay:playerScore', { player: player.name, score: player.score })}
      >
        <span className="overlay-player-score-text">{player.score}</span>
      </span>
    </article>
  );
}

type TopHudStyle = CSSProperties & {
  '--hud-center-width': string;
  '--hud-gap': string;
  '--hud-side-padding': string;
  '--hud-top': string;
  '--hud-plate-height': string;
};

function topHudStyle(profile: GameProfile): TopHudStyle {
  const safeZone = profile.overlay.hudSafeZone;

  return {
    '--hud-center-width': `${safeZone.centerWidth}px`,
    '--hud-gap': `${safeZone.gap}px`,
    '--hud-side-padding': `${safeZone.sidePadding}px`,
    '--hud-top': `${safeZone.top}px`,
    '--hud-plate-height': `${safeZone.bottom - safeZone.top}px`
  };
}
