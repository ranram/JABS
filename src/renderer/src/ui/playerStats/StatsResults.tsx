import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlayerStats } from '@shared/playerStats';
import { phaseAndRound } from '@shared/matchContext';
import { api } from '../../api';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { CatalogImage } from '../CatalogImage';
import { DisplayText } from '../DisplayText';
import { getObsSourceActivity, subscribeObsSourceActivity } from '../../hooks/obsSourceActivity';
import { placementOrdinalSuffix } from './placementOrdinal';
import questionMark from '../../assets/question-mark.svg';

const runPageSize = 16;
const runColumnSize = 8;
const runPageIntervalMs = 12_000;

function placementTier(placement: number) {
  if (placement === 1) return 'gold';
  if (placement === 2) return 'silver';
  if (placement === 3) return 'bronze';
  return placement <= 7 ? 'platinum' : undefined;
}

type Props = {
  stats?: PlayerStats;
  loading: boolean;
  error?: string;
  linked: boolean;
  tournament: boolean;
  showPlacementLogos?: boolean;
};

export function StatsResults({ stats, loading, error, linked, tournament, showPlacementLogos = true }: Props) {
  const { t, i18n } = useTranslation('overlay');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const run = stats?.run ?? [];
  const wins = run.filter((set) => set.outcome === 'win').length;
  const losses = run.filter((set) => set.outcome === 'loss').length;
  const { active } = useSyncExternalStore(subscribeObsSourceActivity, getObsSourceActivity);
  const pageCount = Math.max(1, Math.ceil(run.length / runPageSize));
  const [runPage, setRunPage] = useState(0);
  const contextKey = JSON.stringify(stats?.context);
  useEffect(() => {
    setRunPage(0);
  }, [contextKey, pageCount]);
  useEffect(() => {
    if (pageCount === 1 || active === false) return;
    const timer = window.setInterval(() => setRunPage((page) => (page + 1) % pageCount), runPageIntervalMs);
    return () => window.clearInterval(timer);
  }, [contextKey, pageCount, active]);
  const page = Math.min(runPage, pageCount - 1);
  const displayed = run.slice(page * runPageSize, (page + 1) * runPageSize);
  const columns = displayed.length > runColumnSize ? 2 : 1;
  const rows = Math.max(1, Math.ceil(displayed.length / columns));
  return (
    <div className="stats-results">
      <section className="stats-placements" data-entrance="stats-placements" aria-label={t('stats.recentPlacements')}>
        <h2>{t('stats.recentPlacements')}</h2>
        {stats?.placements.length ? (
          <ol className="stats-placement-list">
            {stats.placements.map((placing, index) => (
              <li key={`${placing.tournamentName}-${placing.eventName}-${index}`}>
                <div className="stats-placement-mark" aria-hidden="true">
                  <PlacementLogo id={showPlacementLogos ? placing.logoAssetId : undefined} />
                </div>
                <strong className="stats-event-copy">
                  <DisplayText text={placing.tournamentName} />
                </strong>
                <strong className="stats-place" data-placement-tier={placementTier(placing.placement)}>
                  <span className="stats-place-number">{placing.placement}</span>
                  <sup>{placementOrdinalSuffix(placing.placement, locale)}</sup>
                  <span className="stats-place-separator">/</span>
                  <span className="stats-place-total">
                    {placing.numEntrants === undefined ? '–' : numberFormat.format(placing.numEntrants)}
                  </span>
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="stats-empty">
            {loading
              ? t('stats.loading')
              : error
                ? t('stats.unavailable')
                : !linked
                  ? t('stats.linkProfile')
                  : t('versus.noPlacements')}
          </p>
        )}
        {stats?.placementsError && (
          <p className="stats-notice" role="status">
            {t('stats.placementsUnavailable')}
          </p>
        )}
        {error && stats && (
          <p className="stats-notice" role="status">
            {t('stats.unavailable')}
          </p>
        )}
      </section>

      <section className="stats-run" data-entrance="stats-run" aria-label={t('stats.currentRun')}>
        <header>
          <div>
            <h2>{t('stats.currentRun')}</h2>
            <span className="stats-tournament-name">
              <DisplayText text={stats?.tournamentName ?? ''} />
            </span>
          </div>
          {run.length > 0 && (
            <strong className="stats-record">
              {wins}
              <small>{t('versus.win')}</small>
              <span>—</span>
              {losses}
              <small>{t('versus.loss')}</small>
            </strong>
          )}
        </header>
        {run.length > 0 ? (
          <ol
            className={`stats-run-list${columns === 2 ? ' has-columns' : ''}`}
            style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
          >
            {displayed.map((set) => (
              <li key={set.id} className={`is-${set.outcome}`}>
                <strong className="stats-outcome">
                  {set.outcome === 'unknown' ? '—' : t(set.outcome === 'win' ? 'versus.win' : 'versus.loss')}
                </strong>
                <div className="stats-opponent">
                  <strong>
                    <DisplayText text={set.opponent} />
                  </strong>
                  <span>
                    <DisplayText text={phaseAndRound(set)} />
                  </span>
                </div>
                <strong className="stats-set-score">
                  {set.playerDq ? 'DQ' : (set.playerScore ?? '–')}
                  <span>:</span>
                  {set.opponentDq ? 'DQ' : (set.opponentScore ?? '–')}
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="stats-empty">
            {loading
              ? t('stats.loading')
              : error
                ? t('stats.unavailable')
                : !tournament
                  ? t('stats.chooseTournament')
                  : stats?.runError
                    ? t('stats.runUnavailable')
                    : t('stats.noMatches')}
          </p>
        )}
        {pageCount > 1 && (
          <p className="stats-notice">
            {t('stats.runPage', {
              first: page * runPageSize + 1,
              last: Math.min((page + 1) * runPageSize, run.length),
              total: run.length
            })}
          </p>
        )}
        {stats && !stats.runComplete && run.length > 0 && (
          <p className="stats-notice" role="status">
            {t('stats.incompleteRun')}
          </p>
        )}
      </section>
    </div>
  );
}

function PlacementLogo({ id }: { id?: string }) {
  const revision = useCatalogRevision();
  const [loaded, setLoaded] = useState<{ id: string; url: string }>();
  useEffect(() => {
    let active = true;
    if (id)
      void api
        .statsTournamentLogoAssetUrl(id)
        .then((url) => {
          if (active) setLoaded({ id, url });
        })
        .catch(() => {
          if (active) setLoaded(undefined);
        });
    return () => {
      active = false;
    };
  }, [id, revision]);
  return (
    <CatalogImage
      className="stats-placement-logo"
      src={loaded?.id === id && loaded ? loaded.url : questionMark}
      fallbackSrc={questionMark}
    />
  );
}
