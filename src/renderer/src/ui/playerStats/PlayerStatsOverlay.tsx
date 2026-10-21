import { useTranslation } from 'react-i18next';
import { statsPlayerFromSearch, type StatsPlayer } from '@shared/playerStats';
import { resolveGameProfile } from '@shared/gameProfiles';
import { useOverlayState } from '../../hooks/useOverlayState';
import { useLogoAsset } from '../../hooks/useLogoAssetUrl';
import { usePlayerStatsSettings } from '../../hooks/usePlayerStatsSettings';
import { useBroadcastLogo } from '../../hooks/useBroadcastLogo';
import { phaseAndRound } from '@shared/matchContext';
import { CatalogImage } from '../CatalogImage';
import { DisplayText } from '../DisplayText';
import { displayFlagLabel, displayFlagUrl } from '../overlayPlayerPresentation';
import { ResultArtwork } from '../resultScreen/ResultArtwork';
import { useVictoryTextFit } from '../resultScreen/useVictoryTextFit';
import { useVersusMedia } from '../useVersusMedia';
import { useOverlayEntrance } from '../useOverlayEntrance';
import { usePlayerStats } from './usePlayerStats';
import { StatsResults } from './StatsResults';
import { statsEntrance } from './statsEntrance';
import { useAppearanceStyle } from '../appearance/AppearanceProvider';
import questionMark from '../../assets/question-mark.svg';
import playerPlaceholder from '../../assets/player_placeholder.svg';
import '../resultScreen/victory.css';
import '../resultScreen/spotlight.css';
import './playerStats.css';

export function PlayerStatsOverlay() {
  const { t } = useTranslation('overlay');
  const slot = statsPlayerFromSearch(window.location.search);
  if (!slot)
    return (
      <main className="overlay overlay-route-error" role="alert">
        {t('stats.invalidPlayer')}
      </main>
    );
  return <PlayerStatsScreen slot={slot} />;
}

function PlayerStatsScreen({ slot }: { slot: StatsPlayer }) {
  const { t } = useTranslation(['overlay', 'common']);
  const appearanceStyle = useAppearanceStyle();
  const { state, error } = useOverlayState();
  const selected = state?.selectedSet;
  const player = slot === 1 ? selected?.playerOne : selected?.playerTwo;
  const { media, ready } = useVersusMedia(selected);
  const artwork = media[slot - 1];
  const { state: settings, error: settingsError } = usePlayerStatsSettings();
  const logoAssetId = useBroadcastLogo(settings?.logoAssetId, Boolean(settings?.showTournamentLogo));
  const logo = useLogoAsset(logoAssetId);
  const profile = resolveGameProfile(settings?.stylingGameId ?? selected?.stylingGameId ?? selected?.gameId);
  const characterUrl = settings?.showCharacter ? artwork.characterUrl : undefined;
  const photoUrl = settings?.showPlayerPhoto
    ? (artwork.photoUrl ?? (ready ? playerPlaceholder : undefined))
    : undefined;
  const stats = usePlayerStats(selected, slot);
  const sponsor = player?.prefix?.trim() || player?.sponsor?.trim();
  const flagUrl = displayFlagUrl(player?.country, player?.displayFlag);
  const hasArtwork = Boolean(characterUrl || photoUrl);
  const nameRef = useVictoryTextFit(
    settings ? JSON.stringify([sponsor, player?.name, Boolean(flagUrl)]) : '',
    hasArtwork
  );
  // Scores and network refreshes update the content without replaying the entrance.
  const key = JSON.stringify([slot, selected?.eventId, player?.entrantId, player?.playerId, player?.name]);
  const entrance = useOverlayEntrance(statsEntrance, Boolean(player && settings), ready && logo.ready, key);
  return (
    <main
      ref={entrance}
      className={`overlay victory spotlight player-stats ${profile.overlay.themeClass}${settings?.showBackground ? '' : ' is-transparent-background'}`}
      data-player={slot}
      style={appearanceStyle}
    >
      {!settings ? null : !player ? (
        <span className="stats-waiting">{t('waiting')}</span>
      ) : (
        <section className={`victory-composition${hasArtwork ? '' : ' stats-type-led'}`} aria-label={t('stats.title')}>
          <CatalogImage
            className="victory-logo"
            src={logo.url ?? questionMark}
            fallbackSrc={questionMark}
            entrance="stats-logo"
          />
          <ResultArtwork characterUrl={characterUrl} photoUrl={photoUrl} photoFallbackUrl={playerPlaceholder} />
          <header className={`stats-identity${flagUrl ? ' has-flag' : ''}`} data-entrance="stats-identity">
            <span className="stats-eyebrow">{t('stats.title')}</span>
            {flagUrl && (
              <img
                className="stats-player-flag"
                src={flagUrl}
                alt={displayFlagLabel(player.country, player.displayFlag)}
              />
            )}
            <strong ref={nameRef} className="victory-name">
              {sponsor && (
                <>
                  <span className="victory-sponsor">
                    <DisplayText text={sponsor} />
                  </span>{' '}
                </>
              )}
              <DisplayText text={player.name} />
            </strong>
            <div className="stats-player-context">
              {settings.showSponsorLogo && artwork.sponsorUrl && (
                <CatalogImage className="stats-sponsor-logo" src={artwork.sponsorUrl} />
              )}
              <span>
                <DisplayText text={selected ? phaseAndRound(selected) : ''} />
              </span>
            </div>
          </header>
          <StatsResults
            stats={stats.state}
            loading={!stats.state && !stats.error}
            error={stats.error}
            linked={Boolean(player.playerId)}
            tournament={Boolean(selected?.eventId)}
            showPlacementLogos={settings.showPlacementLogos}
          />
        </section>
      )}
      {(error || settingsError) && (
        <div className="overlay-connection-status" role="status">
          {t('common:status.reconnecting')}
        </div>
      )}
    </main>
  );
}
