import { useLogoAssetUrl } from '../hooks/useLogoAssetUrl';
import { useCatalogRevision } from '../hooks/useCatalogRevision';
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { TopEightMatchupsState } from '@shared/topEightMatchups';
import type { GameCharacterAsset } from '@shared/models';
import { resolveGameProfile } from '@shared/gameProfiles';
import { api } from '../api';
import { useTopEightMatchupsState } from '../hooks/useTopEightMatchupsState';
import { useBroadcastLogo } from '../hooks/useBroadcastLogo';
import './operator/generatorFonts.css';
import './topEightMatchupsOverlay.css';

export function TopEightMatchupsOverlay() {
  const { t } = useTranslation(['overlay', 'common']);
  const { state, error } = useTopEightMatchupsState();
  if (!state)
    return (
      <main className="top8-matchups-overlay is-transparent-background">
        <div className="top8-matchups-status">{error ?? t('overlay:topEightMatchups.loading')}</div>
      </main>
    );
  return <TopEightMatchupsPresentation state={state} connectionError={Boolean(error)} />;
}

export function TopEightMatchupsPresentation({
  state,
  connectionError = false,
  preview = false
}: {
  state: TopEightMatchupsState;
  connectionError?: boolean;
  preview?: boolean;
}) {
  const { t } = useTranslation(['overlay', 'common']);
  const portraits = useTopEightMatchupPortraits(state);
  const logoAssetId = useBroadcastLogo(state.logoAssetId, state.showTournamentLogo);
  const logoUrl = useLogoAssetUrl(logoAssetId);
  const profile = resolveGameProfile(state.stylingGameId);
  const style = {
    '--matchups-accent': profile.overlay.accent,
    '--matchups-background': profile.overlay.background
  } as CSSProperties;
  return (
    <main
      className={`top8-matchups-overlay ${profile.overlay.themeClass}${state.showBackground ? '' : ' is-transparent-background'}${preview ? ' top8-matchups-preview-canvas' : ''}`}
      style={style}
    >
      <header>
        <span>{t('overlay:topEightMatchups.title')}</span>
        <div>
          <strong>{state.tournamentName}</strong>
          {state.eventName && <small>{state.eventName}</small>}
        </div>
      </header>
      {state.showTournamentLogo && logoUrl && <img className="top8-matchups-logo" src={logoUrl} alt="" />}
      <MatchupColumn
        title={t('overlay:topEightMatchups.winners')}
        matchups={state.matchups.slice(0, 2)}
        offset={0}
        portraits={portraits}
        side="winners"
        flipPlayerTwo={state.flipPlayerTwoPortraits}
      />
      <MatchupColumn
        title={t('overlay:topEightMatchups.losers')}
        matchups={state.matchups.slice(2, 4)}
        offset={4}
        portraits={portraits}
        side="losers"
        flipPlayerTwo={state.flipPlayerTwoPortraits}
      />
      {connectionError && <div className="overlay-connection-status">{t('common:status.reconnecting')}</div>}
    </main>
  );
}

function MatchupColumn({
  title,
  matchups,
  portraits,
  offset,
  side,
  flipPlayerTwo
}: {
  title: string;
  matchups: TopEightMatchupsState['matchups'];
  portraits: Record<string, string>;
  offset: number;
  side: 'winners' | 'losers';
  flipPlayerTwo: boolean;
}) {
  return (
    <section className={`top8-matchups-column is-${side}`}>
      <h2>{title}</h2>
      {matchups.map((matchup, matchupIndex) => (
        <article className="top8-matchup" key={matchup.setId ?? `${side}-${matchupIndex}`}>
          {matchup.players.map((player, playerIndex) => {
            const portrait = portraits[String(offset + matchupIndex * 2 + playerIndex)];
            return (
              <div className="top8-matchup-player" key={player.entrantId ?? `${player.name}-${playerIndex}`}>
                <div className="top8-matchup-portrait">
                  {portrait ? (
                    <img
                      className={flipPlayerTwo && playerIndex === 1 ? 'is-flipped' : undefined}
                      src={portrait}
                      alt=""
                    />
                  ) : player.character ? (
                    <span className="top8-matchup-character-fallback">{player.character}</span>
                  ) : null}
                </div>
                <div className="top8-matchup-identity">
                  <small>{player.sponsor || '\u00a0'}</small>
                  <strong>{player.name}</strong>
                </div>
              </div>
            );
          })}
          <b className="top8-matchup-vs">VS</b>
        </article>
      ))}
    </section>
  );
}

function useTopEightMatchupPortraits(state: TopEightMatchupsState) {
  const revision = useCatalogRevision();
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    const players = state.matchups.flatMap(({ players }) => players);
    setPortraits({});
    void api
      .gameCharacterAssets(state.assetCatalogSlug)
      .then(async ({ assets }) => {
        const entries = await Promise.all(
          players.map(async (player, index) => {
            const id = portraitAssetIdFor(player, assets);
            return id
              ? ([String(index), await api.gameCharacterPortraitUrl(state.assetCatalogSlug, id)] as const)
              : undefined;
          })
        );
        if (active) setPortraits(Object.fromEntries(entries.filter((entry) => entry !== undefined)));
      })
      .catch(() => {
        if (active) setPortraits({});
      });
    return () => {
      active = false;
    };
  }, [state.assetCatalogSlug, state.updatedAt, revision]);
  return portraits;
}

function portraitAssetIdFor(
  player: TopEightMatchupsState['matchups'][number]['players'][number],
  assets: readonly GameCharacterAsset[]
) {
  const asset = assets.find(({ character }) => character === player.character);
  if (!asset) return undefined;
  return (
    asset.variants.find(
      ({ assetId, portraitAssetId }) =>
        assetId === player.characterAssetId || portraitAssetId === player.characterAssetId
    )?.portraitAssetId ?? asset.portraitAssetId
  );
}
