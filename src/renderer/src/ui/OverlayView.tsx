import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  resolveGameProfile,
  type GameProfile,
  type OverlayTemplateId
} from '@shared/gameProfiles';
import type { PlayerState, SelectedSetState } from '@shared/models';
import { useOverlayState } from '../hooks/useOverlayState';
import { useCommentatorState } from '../hooks/useCommentatorState';
import { useResultScreenState } from '../hooks/useResultScreenState';
import type { ResultScreenState } from '@shared/resultScreen';
import { announcementSurfaceFromOverlayPath, isCommentatorOverlayPath, isVersusOverlayPath, resolveOverlayPresentation } from './overlayPresentation';
import { VersusOverlay } from './VersusOverlay';
import { announcementPresentation } from './announcementPresentation';
import { displayFlagLabel, displayFlagUrl } from './overlayPlayerPresentation';
import { api } from '../api';
import { playerCharacters, playerPortraitCharacters } from '@shared/characterTeams';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import { loadCharacterPortraits, type CharacterPortrait } from '../characterPortraits';
import { CharacterPortraitStrip } from './CharacterPortraitStrip';
import { BroadcastLayer, MatchChip } from './ScoreOverlayContext';
import './commentatorOverlay.css';
import './operator/generatorFonts.css';

type OverlayTemplateProps = {
  profile: GameProfile;
  selectedSet: SelectedSetState;
};

type PlayerMediaUrls = {
  sponsorLogoUrl?: string;
  playerPhotoUrl?: string;
};

type OverlayMediaUrls = {
  playerOne: PlayerMediaUrls;
  playerTwo: PlayerMediaUrls;
};

const overlayTemplates: Record<OverlayTemplateId, ComponentType<OverlayTemplateProps>> = {
  'sf6-drive': StreetFighterOverlay,
  'tekken-engager': TekkenOverlay,
  'avatar-bending': AvatarLegendsOverlay,
  'tokon-assemble': TokonOverlay,
  'strive-daredevil': GuiltyGearStriveOverlay,
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
  if (isCommentatorOverlayPath(window.location.pathname)) return <CommentatorOverlay />;
  if (isVersusOverlayPath(window.location.pathname)) return <VersusOverlay />;
  return <MatchOverlayView />;
}

function MatchOverlayView() {
  const { t } = useTranslation(['overlay', 'common']);
  const { state, error } = useOverlayState();
  const selectedSet = state?.selectedSet;
  const announcementSurface = announcementSurfaceFromOverlayPath(window.location.pathname);
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
  const playerMedia = usePlayerMediaUrls(selectedSet, Boolean(announcementSurface));

  if (!selectedSet) {
    return (
      <main className={`overlay overlay-loading ${profile.overlay.themeClass}`}>
        <span>{t('waiting')}</span>
      </main>
    );
  }

  if (announcementSurface) {
    return (
      <AnnouncementOverlay
        profile={profile}
        selectedSet={selectedSet}
        playerMedia={playerMedia}
        reconnecting={Boolean(error)}
      />
    );
  }

  return (
    <main
      className={`overlay ${profile.overlay.themeClass}`}
      data-game-id={profile.id}
      data-overlay-template={profile.overlay.template}
    >
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
  const { state, error } = useCommentatorState();
  const logoUrl = useLogoAssetUrl(state?.logoAssetId);
  if (!state || state.presentation === 'hidden') return <main className="overlay commentator-overlay" />;
  const stylingProfile = resolveGameProfile(state.stylingGameId);
  return (
    <main className={`overlay commentator-overlay ${stylingProfile.overlay.themeClass}`}>
      <section
        key={state.updatedAt}
        className={`commentator-lower-third is-${state.presentation}`}
        aria-label="Commentators"
      >
        <CommentatorIdentity side="left" {...state.commentators[0]} />
        <div className="commentator-event-mark">
          {logoUrl && <CatalogImage className="commentator-event-logo" src={logoUrl} />}
          <span>{state.tournamentName}</span>
        </div>
        <CommentatorIdentity side="right" {...state.commentators[1]} />
      </section>
      {error && <div className="overlay-connection-status" role="status">{error}</div>}
    </main>
  );
}

function CommentatorIdentity({
  side,
  name,
  handle
}: {
  side: 'left' | 'right';
  name: string;
  handle: string;
}) {
  return (
    <div className={`commentator-identity commentator-identity-${side}`}>
      <strong>{name}</strong>
      {handle && <span>{handle}</span>}
    </div>
  );
}

function AnnouncementOverlay({
  profile,
  selectedSet,
  playerMedia,
  reconnecting
}: OverlayTemplateProps & {
  playerMedia: OverlayMediaUrls;
  reconnecting: boolean;
}) {
  const { t } = useTranslation(['overlay', 'common']);
  const presentation = announcementPresentation(selectedSet);
  const winner = presentation?.winner;
  const winnerMedia = winner === selectedSet.playerOne ? playerMedia.playerOne : playerMedia.playerTwo;
  const winnerCharacters = winner ? playerCharacters(winner) : [];
  const { state: savedSettings } = useResultScreenState();
  const settings = savedSettings ?? defaultResultScreenSettings;
  const stylingProfile = resolveGameProfile(savedSettings?.stylingGameId ?? profile.id);
  const characterMedia = useAnnouncementCharacterMedia(
    selectedSet.assetCatalogSlug ?? selectedSet.gameId,
    settings.showCharacter ? winnerCharacters[0] : undefined,
    settings.showCharacter ? winner?.characterAssetId : undefined,
    settings.showCharacter && winner ? playerPortraitCharacters(winner) : []
  );
  const { characterUrl, characterPortraits } = characterMedia;
  const photoUrl = settings.showPlayerPhoto ? winnerMedia.playerPhotoUrl : undefined;
  const sponsorLogoUrl = settings.showSponsorLogo ? winnerMedia.sponsorLogoUrl : undefined;
  const resultLogoUrl = useResultLogoAssetUrl(
    selectedSet.broadcast?.logoAssetId,
    settings.showTournamentLogo
  );
  const mediaClass = [
    photoUrl && 'has-photo',
    characterUrl && 'has-character',
    sponsorLogoUrl && 'has-sponsor'
  ].filter(Boolean).join(' ');

  return (
    <main
      className={`overlay overlay-announcement overlay-announcement-${presentation?.kind ?? 'winner'} ${stylingProfile.overlay.themeClass}`}
      data-game-id={profile.id}
      data-announcement-surface="result"
      data-announcement-kind={presentation?.kind}
    >
      {winner && (
        <section className="announcement-composition">
          <div className={`announcement-subject ${mediaClass}`} aria-hidden="true">
            {sponsorLogoUrl && (
              <CatalogImage
                className="announcement-sponsor-watermark"
                src={sponsorLogoUrl}
              />
            )}
            <span className="announcement-subject-placeholder">{winner.name.slice(0, 1)}</span>
            {characterUrl && (
              <CatalogImage
                className="announcement-character-art"
                src={characterUrl}
              />
            )}
            {photoUrl && (
              <CatalogImage
                className="announcement-player-photo"
                src={photoUrl}
              />
            )}
            <CharacterPortraitStrip
              portraits={characterPortraits}
              className="announcement-character-portraits"
              side="right"
            />
          </div>
          <div className="announcement-copy">
            <span className="announcement-kicker">
              {presentation?.kind === 'champion' ? t('championAnnouncement') : t('winnerAnnouncement')}
            </span>
            <strong>{winner.name}</strong>
            {settings.showCharacter && !characterMedia.hasCatalogMedia && winnerCharacters.length > 0 && (
              <span className="announcement-character">{winnerCharacters.join(' / ')}</span>
            )}
            <small>{[selectedSet.phase?.trim(), selectedSet.round?.trim()].filter(Boolean).join(' · ')}</small>
          </div>
          {resultLogoUrl && <CatalogImage className="announcement-tournament-logo" src={resultLogoUrl} />}
        </section>
      )}
      {reconnecting && <div className="overlay-connection-status" role="status">{t('common:status.reconnecting')}</div>}
    </main>
  );
}

const defaultResultScreenSettings: ResultScreenState = {
  stylingGameId: 'street-fighter-6',
  showTournamentLogo: true,
  showPlayerPhoto: true,
  showSponsorLogo: true,
  showCharacter: true,
  updatedAt: '1970-01-01T00:00:00.000Z'
};
function useAnnouncementCharacterMedia(
  gameId: string,
  leadCharacter: string | undefined,
  characterAssetId: string | undefined,
  portraitCharacters: string[]
): {
  characterUrl?: string;
  characterPortraits: CharacterPortrait[];
  hasCatalogMedia: boolean;
} {
  const [media, setMedia] = useState<{
    characterUrl?: string;
    characterPortraits: CharacterPortrait[];
    hasCatalogMedia: boolean;
  }>({ characterPortraits: [], hasCatalogMedia: false });
  const portraitKey = portraitCharacters.join('\u0000');
  useEffect(() => {
    let active = true;
    if (!leadCharacter && !portraitKey) {
      setMedia({ characterPortraits: [], hasCatalogMedia: false });
      return () => { active = false; };
    }
    void api.gameCharacterAssets(gameId)
      .then(async ({ assets }) => {
        const selectedAssetId = selectedCharacterAssetId({
          character: leadCharacter,
          characterAssetId
        }, assets);
        const hasCatalogMedia = assets.some((asset) => Boolean(asset.assetId || asset.portraitAssetId));
        const selectedPortraits = portraitKey ? portraitKey.split('\u0000') : [];
        const [characterUrl, characterPortraits] = await Promise.all([
          selectedAssetId ? api.gameCharacterAssetUrl(gameId, selectedAssetId) : undefined,
          loadCharacterPortraits(gameId, selectedPortraits, assets)
        ]);
        if (active) setMedia({ characterUrl, characterPortraits, hasCatalogMedia });
      })
      .catch(() => {
        if (active) setMedia({ characterPortraits: [], hasCatalogMedia: false });
      });
    return () => { active = false; };
  }, [characterAssetId, gameId, leadCharacter, portraitKey]);
  return media;
}

function useResultLogoAssetUrl(preferredAssetId: string | undefined, enabled: boolean): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    if (!enabled) {
      setUrl(undefined);
      return () => { active = false; };
    }
    void api.logos()
      .then(async ({ logos }) => {
        const asset = logos.find((candidate) => candidate.id === preferredAssetId) ?? logos[0];
        const nextUrl = asset ? await api.logoAssetUrl(asset.id) : undefined;
        if (active) setUrl(nextUrl);
      })
      .catch(() => { if (active) setUrl(undefined); });
    return () => { active = false; };
  }, [enabled, preferredAssetId]);
  return url;
}

function usePlayerMediaUrls(
  selectedSet: SelectedSetState | undefined,
  enabled: boolean
): OverlayMediaUrls {
  const [media, setMedia] = useState<OverlayMediaUrls>({ playerOne: {}, playerTwo: {} });
  useEffect(() => {
    let active = true;
    if (!selectedSet || !enabled) {
      setMedia({ playerOne: {}, playerTwo: {} });
      return () => {
        active = false;
      };
    }

    void api.playerMedia()
      .then(async (matches) => {
        const resolvePlayerMedia = async (match: typeof matches.playerOne): Promise<PlayerMediaUrls> => {
          const [sponsorLogoUrl, playerPhotoUrl] = await Promise.all([
            match.sponsorLogoAssetId ? api.sponsorLogoAssetUrl(match.sponsorLogoAssetId) : undefined,
            match.playerPhotoAssetId ? api.playerPhotoAssetUrl(match.playerPhotoAssetId) : undefined
          ]);
          return { sponsorLogoUrl, playerPhotoUrl };
        };
        const [playerOne, playerTwo] = await Promise.all([
          resolvePlayerMedia(matches.playerOne),
          resolvePlayerMedia(matches.playerTwo)
        ]);
        if (active) setMedia({ playerOne, playerTwo });
      })
      .catch(() => {
        if (active) setMedia({ playerOne: {}, playerTwo: {} });
      });
    return () => {
      active = false;
    };
  }, [
    enabled,
    selectedSet?.playerOne.name,
    selectedSet?.playerOne.prefix,
    selectedSet?.playerOne.sponsor,
    selectedSet?.playerTwo.name,
    selectedSet?.playerTwo.prefix,
    selectedSet?.playerTwo.sponsor
  ]);
  return media;
}

function useLogoAssetUrl(assetId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    if (!assetId) {
      setUrl(undefined);
      return () => {
        active = false;
      };
    }
    void api.logoAssetUrl(assetId)
      .then((nextUrl) => {
        if (active) setUrl(nextUrl);
      })
      .catch(() => {
        if (active) setUrl(undefined);
      });
    return () => {
      active = false;
    };
  }, [assetId]);
  return url;
}

function CatalogImage({ src, className }: { src: string; className?: string }) {
  return (
    <img
      className={[className, 'is-loaded'].filter(Boolean).join(' ')}
      src={src}
      alt=""
      aria-hidden="true"
      onLoad={(event) => { event.currentTarget.style.removeProperty('display'); }}
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />
  );
}

function StreetFighterOverlay({ profile, selectedSet }: OverlayTemplateProps) {
  return (
    <section
      className="overlay-frame top-hud-frame sf6-frame"
      style={topHudStyle(profile)}
    >
      <PlayerPlate player={selectedSet.playerOne} side="left" />
      <MatchChip profile={profile} selectedSet={selectedSet} />
      <PlayerPlate player={selectedSet.playerTwo} side="right" />
    </section>
  );
}

function TekkenOverlay({ profile, selectedSet }: OverlayTemplateProps) {
  return (
    <section
      className="overlay-frame top-hud-frame tekken-frame"
      style={topHudStyle(profile)}
    >
      <PlayerPlate player={selectedSet.playerOne} side="left" />
      <MatchChip profile={profile} selectedSet={selectedSet} />
      <PlayerPlate player={selectedSet.playerTwo} side="right" />
    </section>
  );
}

function AvatarLegendsOverlay({ profile, selectedSet }: OverlayTemplateProps) {
  return (
    <section
      className="overlay-frame top-hud-frame avatar-legends-frame"
      style={topHudStyle(profile)}
    >
      <PlayerPlate player={selectedSet.playerOne} side="left" />
      <MatchChip profile={profile} selectedSet={selectedSet} />
      <PlayerPlate player={selectedSet.playerTwo} side="right" />
    </section>
  );
}

function GuiltyGearStriveOverlay({ profile, selectedSet }: OverlayTemplateProps) {
  return (
    <section
      className="overlay-frame top-hud-frame strive-frame"
      style={topHudStyle(profile)}
    >
      <PlayerPlate player={selectedSet.playerOne} side="left" />
      <MatchChip profile={profile} selectedSet={selectedSet} />
      <PlayerPlate player={selectedSet.playerTwo} side="right" />
    </section>
  );
}

function TokonOverlay({ profile, selectedSet }: OverlayTemplateProps) {
  return (
    <section
      className="overlay-frame top-hud-frame tokon-frame"
      style={topHudStyle(profile)}
    >
      <PlayerPlate player={selectedSet.playerOne} side="left" />
      <MatchChip profile={profile} selectedSet={selectedSet} />
      <PlayerPlate player={selectedSet.playerTwo} side="right" />
    </section>
  );
}

function TournamentRibbonOverlay({ profile, selectedSet }: OverlayTemplateProps) {
  return (
    <section
      className={`overlay-frame top-hud-frame tournament-ribbon-frame ${profile.overlay.template}-frame`}
      style={topHudStyle(profile)}
    >
      <PlayerPlate player={selectedSet.playerOne} side="left" />
      {profile.overlay.showMatchChip === false ? (
        <div className="overlay-hud-clear" aria-hidden="true" />
      ) : (
        <MatchChip profile={profile} selectedSet={selectedSet} />
      )}
      <PlayerPlate player={selectedSet.playerTwo} side="right" />
    </section>
  );
}

type PlayerPlateProps = {
  player: PlayerState;
  side: 'left' | 'right';
};

function PlayerPlate({ player, side }: PlayerPlateProps) {
  const { t } = useTranslation(['overlay', 'common']);
  const sponsor = sponsorLine(player);
  const details =
    player.seed === undefined
      ? undefined
      : t('common:match.seed', { seed: player.seed });
  const flagUrl = displayFlagUrl(player.country, player.displayFlag);

  return (
    <article className={`overlay-player overlay-player-${side}${flagUrl ? ' has-country-flag' : ''}`}>
      {flagUrl && (
        <span
          className="overlay-player-flag"
          role="img"
          aria-label={displayFlagLabel(player.country, player.displayFlag)}
        >
          <img src={flagUrl} alt="" aria-hidden="true" />
        </span>
      )}
      <div className="overlay-player-copy">
        {sponsor && (
          <span className="overlay-player-team">
            {sponsor}
          </span>
        )}
        <span className="overlay-player-identity">
          <strong className="overlay-player-name">{player.name}</strong>
        </span>
        {(player.pronouns || details) && (
          <span className="overlay-player-meta">
            {player.pronouns && <span className="overlay-player-pronouns">{player.pronouns}</span>}
            {details && <span className="overlay-player-details">{details}</span>}
          </span>
        )}
      </div>
      <span
        className="overlay-player-score"
        aria-label={t('overlay:playerScore', { player: player.name, score: player.score })}
      >
        {player.score}
      </span>
    </article>
  );
}

function sponsorLine(player: PlayerState): string {
  return [...new Set([player.prefix, player.sponsor].filter((value): value is string => Boolean(value)))]
    .join(' · ');
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
