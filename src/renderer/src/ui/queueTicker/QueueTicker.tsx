import type { ReactNode } from 'react';
import { useResizeObserver } from '@mantine/hooks';
import { ResultMarker } from '../ResultMarker';
import { useAppearanceStyle } from '../appearance/AppearanceProvider';
import { useTranslation } from 'react-i18next';
import type { QueueTickerSnapshot } from '@shared/queueTicker';
import { useLogoAssetUrl } from '../../hooks/useLogoAssetUrl';
import { useQueueTicker } from '../../hooks/useQueueTicker';
import { useOverlayState } from '../../hooks/useOverlayState';
import '../operator/generatorFonts.css';
import '../fonts/bundledFonts.css';
import { resolveGameProfile } from '@shared/gameProfiles';
import './queueTicker.css';
import './queueTickerCompact.css';
import './queueTickerTransitions.css';
import { TICKER_SCROLL_PIXELS_PER_SECOND, useTickerRotation } from './useTickerRotation';

export function QueueTickerOverlay() {
  const { state, error } = useQueueTicker();
  return <main className="queue-ticker-stage">{state && !error && <QueueTickerBar state={state} />}</main>;
}

export function QueueTickerBar({
  state,
  preview = false,
  previewLane = 'upcoming'
}: {
  state: QueueTickerSnapshot;
  preview?: boolean;
  previewLane?: 'upcoming' | 'results';
}) {
  const { t } = useTranslation('operator');
  const appearanceStyle = useAppearanceStyle();
  const { state: overlayState } = useOverlayState();
  const selectedSet = overlayState?.selectedSet;
  const profile = resolveGameProfile(state.settings.stylingGameId ?? selectedSet?.stylingGameId ?? selectedSet?.gameId);
  const logoUrl = useLogoAssetUrl(
    state.settings.enabled && state.settings.showLogo ? state.settings.logoAssetId : undefined
  );
  const hasUpcoming = state.upcoming.length > 0;
  const hasResults = state.settings.showResults && state.results.length > 0;
  const cycle = state.settings.enabled && !preview && hasUpcoming && hasResults;
  const rotation = useTickerRotation(cycle, state.settings.style);
  const activeLane = preview ? previewLane : rotation.lane;
  const showUpcoming = hasUpcoming && (activeLane === 'upcoming' || !hasResults);
  const showResults = hasResults && (activeLane === 'results' || !hasUpcoming);
  if (!state.settings.enabled || (!hasUpcoming && !hasResults)) return null;
  return (
    <section
      className={`queue-ticker-bar ${profile.overlay.themeClass}`}
      style={appearanceStyle}
      aria-label={t('queueTicker.title')}
      data-preview={preview || undefined}
      data-style={state.settings.style}
    >
      <div className="queue-ticker-lanes" data-cycle={cycle || undefined}>
        {showUpcoming && (
          <TickerLane
            key="upcoming"
            label={t('queueTicker.upcoming')}
            animate={!preview}
            enter={cycle && rotation.entered}
            holding={cycle && rotation.holding}
          >
            {state.upcoming.map((match) => (
              <TickerMatchCard match={match} key={match.setId} />
            ))}
          </TickerLane>
        )}
        {showResults && (
          <TickerLane
            key="results"
            label={t('queueTicker.results')}
            results
            animate={!preview}
            enter={cycle && rotation.entered}
            holding={cycle && rotation.holding}
          >
            {state.results.map((match) => (
              <TickerMatchCard match={match} key={match.setId} />
            ))}
          </TickerLane>
        )}
      </div>
      {logoUrl && (
        <div className="queue-ticker-logo">
          <img src={logoUrl} alt="" />
        </div>
      )}
    </section>
  );
}

function TickerLane({
  label,
  results = false,
  animate,
  enter,
  holding,
  children
}: {
  label: string;
  results?: boolean;
  animate: boolean;
  enter: boolean;
  holding: boolean;
  children: ReactNode;
}) {
  const [measureRef, { width }] = useResizeObserver<HTMLDivElement>();
  return (
    <div className={`queue-ticker-row${results ? ' queue-ticker-results' : ''}`} data-enter={enter || undefined}>
      <strong className="queue-ticker-heading">
        <span>{label}</span>
      </strong>
      <div className="queue-ticker-window">
        <div
          className="queue-ticker-track"
          data-animate={animate || undefined}
          data-hold={holding || undefined}
          style={
            animate && width > 0 ? { animationDuration: `${width / TICKER_SCROLL_PIXELS_PER_SECOND}s` } : undefined
          }
        >
          {(animate ? [0, 1] : [0]).map((copy) => (
            <div
              className="queue-ticker-matches"
              ref={copy === 0 ? measureRef : undefined}
              key={copy}
              aria-hidden={copy === 1 || undefined}
            >
              {children}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type TickerMatch = QueueTickerSnapshot['upcoming'][number] | QueueTickerSnapshot['results'][number];

function TickerMatchCard({ match }: { match: TickerMatch }) {
  const result = 'scoreOne' in match ? match : undefined;
  return (
    <div className="queue-ticker-match">
      <div className="queue-ticker-player" data-player-side="one">
        {result && <ResultMarker mark={result.winner === 'one' ? 'W' : result.scoreOne === 'DQ' ? 'DQ' : 'L'} />}
        <span className="queue-ticker-name" data-player-side="one" data-winner={result?.winner === 'one' || undefined}>
          {match.playerOne}
        </span>
      </div>
      <div className="queue-ticker-duel">
        {result ? (
          <strong className="queue-ticker-score">
            {result.scoreOne} – {result.scoreTwo}
          </strong>
        ) : (
          <span className="queue-ticker-separator">vs</span>
        )}
        <MatchContext match={match} />
      </div>
      <div className="queue-ticker-player" data-player-side="two">
        <span className="queue-ticker-name" data-player-side="two" data-winner={result?.winner === 'two' || undefined}>
          {match.playerTwo}
        </span>
        {result && <ResultMarker mark={result.winner === 'two' ? 'W' : result.scoreTwo === 'DQ' ? 'DQ' : 'L'} />}
      </div>
      <span className="queue-ticker-divider" aria-hidden="true" />
    </div>
  );
}

function MatchContext({ match }: { match: QueueTickerSnapshot['upcoming'][number] }) {
  const label = [match.phase, match.round].filter(Boolean).join(' · ');
  return label ? (
    <small className="queue-ticker-round" title={label}>
      {label}
    </small>
  ) : null;
}
