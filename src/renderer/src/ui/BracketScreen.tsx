import { useBracketLabel, useAppearanceStyle, withBroadcastLanguage } from './appearance/AppearanceProvider';
import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveGameProfile } from '@shared/gameProfiles';
import { bracketScopeKey, type BracketScreenState, type BracketMatch, type BracketSlot } from '@shared/bracketScreen';
import { displayPhaseName } from '@shared/matchContext';
import { useBracketScreenState } from '../hooks/useBracketScreenState';
import { useBroadcastLogo } from '../hooks/useBroadcastLogo';
import { useLogoAssetUrl } from '../hooks/useLogoAssetUrl';
import { DisplayText } from './DisplayText';
import { displayFlagLabel, displayFlagUrl } from './overlayPlayerPresentation';
import { bracketLayout, bracketConnections, bracketWidth, type BracketLaneLayout } from './bracketLayout';
import { useOverlayEntrance } from './useOverlayEntrance';
import { bracketScreenEntrance } from './bracketScreenEntrance';
import './bracketScreen.css';

export function BracketScreen() {
  const { state } = useBracketScreenState();
  return state ? <BracketPresentation state={state} /> : <main className="bracket-screen is-transparent-background" />;
}

function BracketPresentationContent({ state, preview = false }: { state: BracketScreenState; preview?: boolean }) {
  const { t } = useTranslation(['operator', 'common']);
  const appearanceStyle = useAppearanceStyle();
  const { settings } = state;
  const snapshot =
    bracketScopeKey(state.snapshot?.scope) === bracketScopeKey(settings.scope) ? state.snapshot : undefined;
  const layout = useMemo(
    () => bracketLayout(snapshot?.matches ?? [], snapshot?.advances, settings.winnersRound, settings.losersRound),
    [snapshot?.matches, snapshot?.advances, settings.winnersRound, settings.losersRound]
  );
  const hasMatches = Boolean(layout.winners.placed.length || layout.losers.placed.length);
  const profile = resolveGameProfile(settings.stylingGameId);
  const logoUrl = useLogoAssetUrl(useBroadcastLogo(settings.logoAssetId, settings.showTournamentLogo));
  const ref = useOverlayEntrance(
    bracketScreenEntrance,
    !preview && hasMatches,
    true,
    `${bracketScopeKey(settings.scope)}/${settings.winnersRound ?? 'auto'}/${settings.losersRound ?? 'auto'}`
  );
  const style = {
    '--bracket-accent': profile.overlay.accent,
    '--bracket-background': profile.overlay.background,
    ...appearanceStyle
  } as CSSProperties;
  const matches = useMemo(() => new Map(snapshot?.matches.map((match) => [match.id, match])), [snapshot?.matches]);
  return (
    <main
      ref={ref}
      style={style}
      className={`bracket-screen ${profile.overlay.themeClass}${settings.showBackground ? '' : ' is-transparent-background'}`}
    >
      {snapshot && hasMatches ? (
        <>
          <header data-entrance="bracket-heading">
            <div>
              <span>
                <DisplayText text={settings.heading?.trim() || t('operator:bracketScreen.title')} />
              </span>
              <strong>
                <DisplayText text={snapshot.tournamentName} />
              </strong>
              <small>
                <DisplayText
                  text={[
                    settings.eventLabel?.trim() || snapshot.eventName,
                    displayPhaseName(snapshot.phaseName),
                    snapshot.groupCount === 1 ? undefined : snapshot.groupName
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </small>
            </div>
            {logoUrl && <img src={logoUrl} alt="" />}
          </header>
          <div className="bracket-lanes">
            <BracketLane side="winners" layout={layout.winners} matches={matches} />
            <BracketLane side="losers" layout={layout.losers} matches={matches} />
          </div>
        </>
      ) : preview ? (
        <p className="bracket-empty">
          {t(
            snapshot
              ? 'operator:bracketScreen.noMatches'
              : settings.scope
                ? 'operator:bracketScreen.waiting'
                : 'operator:bracketScreen.chooseScope'
          )}
        </p>
      ) : null}
    </main>
  );
}

function BracketLane({
  side,
  layout,
  matches
}: {
  side: 'winners' | 'losers';
  layout: BracketLaneLayout;
  matches: Map<string, BracketMatch>;
}) {
  const title = useBracketLabel(side);
  const connections = useMemo(() => bracketConnections(layout), [layout]);
  if (!layout.columns.length) return null;
  const { bodyHeight, cardHeight, contentWidth } = layout;
  const style = {
    height: bodyHeight + 60,
    '--bracket-card-height': `${cardHeight}px`,
    '--bracket-advance-height': `${Math.max(1, Math.min(28, cardHeight / 2 - 2))}px`,
    '--bracket-name-size': `${Math.min(28, Math.max(5, cardHeight * 0.4))}px`,
    '--bracket-flag-width': `${Math.min(28, cardHeight * 0.4)}px`,
    '--bracket-flag-height': `${Math.min(20, cardHeight * 0.3)}px`
  } as CSSProperties;
  return (
    <section style={style} className={`bracket-lane is-${side}`} aria-label={title}>
      <h2>
        <DisplayText text={title} />
      </h2>
      <div className="bracket-rounds" style={{ height: bodyHeight + 28 }}>
        <svg
          className="bracket-connections"
          data-entrance={`${side}-connections`}
          style={{ height: bodyHeight }}
          viewBox={`0 0 ${bracketWidth} ${bodyHeight}`}
          aria-hidden="true"
        >
          {connections.map(({ id, path }) => (
            <path key={id} d={path} />
          ))}
        </svg>
        <div className="bracket-columns" style={{ width: contentWidth }}>
          {layout.columns.map((column, index) => (
            <section
              key={column.roundNumber}
              className="bracket-column"
              data-entrance={`${side}-column-${index}`}
              style={{ width: `${100 / layout.columns.length}%` }}
            >
              <h3 className="bracket-round-title">
                <DisplayText text={column.title} />
              </h3>
              <div className="bracket-column-matches" style={{ height: bodyHeight }}>
                {layout.placed
                  .filter((entry) => entry.column === index)
                  .map(({ match, y }) => (
                    <article
                      key={match.id}
                      className={`bracket-match${match.state === 2 ? ' is-playing' : ''}`}
                      style={{ top: y }}
                    >
                      {match.slots.map((slot, row) => (
                        <BracketPlayer key={row} slot={slot} match={match} matches={matches} />
                      ))}
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <div data-entrance={`${side}-advances`} className="bracket-advances" style={{ left: contentWidth + 48 }}>
          {layout.advances.map(({ id, label, y, sourceX }) => (
            <div key={id} className="bracket-advance-row" style={{ top: y }}>
              <span
                className="bracket-advance-arrow"
                style={{ width: contentWidth + 48 - sourceX }}
                aria-hidden="true"
              />
              <span className="bracket-advance">
                <DisplayText text={label} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BracketPlayer({
  slot,
  match,
  matches
}: {
  slot: BracketSlot;
  match: BracketMatch;
  matches: Map<string, BracketMatch>;
}) {
  const { t } = useTranslation('operator');
  const flag = displayFlagUrl(slot.country, undefined);
  const winner = Boolean(match.winnerId && slot.entrantId === match.winnerId);
  const loser = Boolean(match.winnerId && slot.entrantId && !winner);
  const feeder = slot.prerequisite && matches.get(slot.prerequisite.setId);
  const placeholder = slot.prerequisite
    ? t(slot.prerequisite.placement === 1 ? 'bracketScreen.winnerOf' : 'bracketScreen.loserOf', {
        round: feeder ? `${feeder.round} #${feeder.id}` : `#${slot.prerequisite.setId}`
      })
    : t(match.state === 3 && !slot.entrantId ? 'bracketScreen.bye' : 'bracketScreen.tbd');
  return (
    <div
      className={`bracket-player${winner ? ' is-winner' : loser ? ' is-loser' : ''}${!slot.entrantId ? ' is-pending' : ''}`}
    >
      <span className="bracket-flag"><img src={flag} alt={displayFlagLabel(slot.country, undefined)} /></span>
      <strong title={slot.name ?? placeholder}>
        {slot.sponsor && (
          <span className="bracket-sponsor">
            <DisplayText text={slot.sponsor} />
            {'|'}
          </span>
        )}
        <DisplayText text={slot.name ?? placeholder} />
      </strong>
      <span className="bracket-score">
        <span className="bracket-score-text">{slot.score === -1 ? 'DQ' : (slot.score ?? '—')}</span>
      </span>
    </div>
  );
}

export const BracketPresentation = withBroadcastLanguage(BracketPresentationContent);
