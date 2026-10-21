import { useTranslation } from 'react-i18next';
import type { PlayerState, SelectedSetState } from '@shared/models';
import { resolveGameProfile } from '@shared/gameProfiles';
import { phaseAndRound } from '@shared/matchContext';
import { versusHistoryMatch, type VersusHistory, type VersusScreenState } from '@shared/versusScreen';
import { CatalogImage } from '../CatalogImage';
import { DisplayText } from '../DisplayText';
import { useMatchFormatLabel } from '../useMatchFormatLabel';
import { displayFlagLabel, displayFlagUrl, isPrideDisplayFlag } from '../overlayPlayerPresentation';
import { useVersusNameFit } from './useVersusNameFit';
import type { SubjectMedia } from '../useVersusMedia';
import type { VersusDetail } from './useVersusDetails';
import { useVersusCardFit } from './useVersusCardFit';

export function VersusMatchCard({
  set,
  settings,
  history,
  media,
  rows,
  logoUrl
}: {
  set: SelectedSetState;
  settings: VersusScreenState;
  history?: VersusHistory;
  media: [SubjectMedia, SubjectMedia];
  rows: VersusDetail[];
  logoUrl?: string;
}) {
  const { t } = useTranslation('overlay');
  const format = useMatchFormatLabel(set);
  const cardRef = useVersusCardFit();
  const players = [set.playerOne, set.playerTwo];
  const showLogos = settings.showSponsorLogos && media.every((entry) => Boolean(entry.sponsorUrl));
  return (
    <section
      ref={cardRef}
      className={`versus-center-card${settings.showMatchBackdrop ? '' : ' is-without-backdrop'}`}
      data-entrance="panel"
    >
      <div className="versus-match-body">
        <header className="versus-match-heading" data-entrance="heading">
          {logoUrl && (
            <div className="versus-logo-tab">
              <CatalogImage className="versus-match-logo" src={logoUrl} />
            </div>
          )}
          <h1>{t('versus.upcomingMatch')}</h1>
          <div className="versus-match-title">
            <DisplayText text={phaseAndRound(set)} />
          </div>
        </header>
        <div className="versus-names">
          {players.map((player, index) => (
            <PlayerName key={index} player={player} index={index} />
          ))}
        </div>
        <div className="versus-stat-list" data-entrance="stats">
          {rows.map((row) => (
            <div className={`versus-stat-row versus-stat-${row.id}`} key={row.id} data-stat={row.id}>
              <strong className="versus-stat-value">
                {row.id === 'sponsor' && showLogos && (
                  <CatalogImage className="versus-player-sponsor-logo" src={media[0].sponsorUrl!} />
                )}
                <span className="versus-stat-text" title={row.values[0]}>
                  <DisplayText text={row.values[0]} />
                </span>
              </strong>
              <span className="versus-stat-label">{row.label}</span>
              <strong className="versus-stat-value versus-stat-value-right">
                {row.id === 'sponsor' && showLogos && (
                  <CatalogImage className="versus-player-sponsor-logo" src={media[1].sponsorUrl!} />
                )}
                <span className="versus-stat-text" title={row.values[1]}>
                  <DisplayText text={row.values[1]} />
                </span>
              </strong>
            </div>
          ))}
        </div>
        {settings.showHeadToHead && versusHistoryMatch(set) && (
          <HeadToHead history={history} loading={settings.historyLoading} />
        )}
      </div>
      <footer className="versus-match-footer" data-entrance="format">
        <span className="versus-match-game">
          <DisplayText text={set.gameName?.trim() || resolveGameProfile(set.gameId).label} />
        </span>
        <span className="versus-match-separator" aria-hidden="true">
          ·
        </span>
        <span className="versus-match-format">{format}</span>
      </footer>
    </section>
  );
}

function PlayerName({ player, index }: { player: PlayerState; index: number }) {
  const ref = useVersusNameFit(player.name);
  const flagUrl = displayFlagUrl(player.country, player.displayFlag);
  return (
    <div
      className={`versus-identity versus-identity-${index === 0 ? 'left' : 'right'}`}
      data-entrance={`name-${index === 0 ? 'left' : 'right'}`}
    >
      <div className="versus-flag-slot">
        {flagUrl && (
          <img
            className={`versus-country-flag${isPrideDisplayFlag(player.displayFlag) ? ' is-pride' : ''}`}
            src={flagUrl}
            alt={displayFlagLabel(player.country, player.displayFlag) ?? ''}
          />
        )}
      </div>
      <strong ref={ref} className="versus-name-row">
        <span className="versus-name-text">
          <span className="versus-player-tag">
            <DisplayText text={player.name} />
          </span>
        </span>
      </strong>
    </div>
  );
}

function HeadToHead({ history, loading = false }: { history?: VersusHistory; loading?: boolean }) {
  const { t } = useTranslation('overlay');
  const sets = history?.headToHead ?? [];
  return (
    <div className="versus-h2h" data-entrance="h2h" aria-busy={loading}>
      <h2>{t('versus.headToHead')}</h2>
      {loading ? (
        <div className="versus-h2h-loading">
          <div className="versus-h2h-loading-bar" role="progressbar" aria-label={t('versus.headToHead')} />
        </div>
      ) : sets.length ? (
        sets.map((set, index) => {
          const won = set.playerOneScore > set.playerTwoScore;
          return (
            <div
              className="versus-h2h-row"
              key={set.setId ?? `${set.tournamentName}-${set.round}-${set.completedAt}-${index}`}
            >
              <b className={`versus-h2h-outcome ${won ? 'is-win' : 'is-loss'}`}>
                {t(won ? 'versus.win' : 'versus.loss')}
              </b>
              <strong>{set.playerOneScore}</strong>
              <div className="versus-h2h-event">
                <span>
                  <DisplayText text={set.tournamentName} />
                </span>
                <small>
                  <DisplayText text={[set.phase, set.round].filter(Boolean).join(' · ')} />
                </small>
              </div>
              <strong>{set.playerTwoScore}</strong>
              <b className={`versus-h2h-outcome ${won ? 'is-loss' : 'is-win'}`}>
                {t(won ? 'versus.loss' : 'versus.win')}
              </b>
            </div>
          );
        })
      ) : (
        <p>{t('versus.noHeadToHead')}</p>
      )}
    </div>
  );
}
