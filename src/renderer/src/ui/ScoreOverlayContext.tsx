import { type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameProfile } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';

type ScoreOverlayContextProps = {
  profile: GameProfile;
  selectedSet: SelectedSetState;
};

type BroadcastStyle = CSSProperties & {
  '--broadcast-bottom': string;
  '--broadcast-height': string;
  '--broadcast-rail-width': string;
  '--broadcast-center-width': string;
  '--broadcast-logo-height': string;
  '--broadcast-logo-top': string;
};

export function MatchChip({ profile, selectedSet }: ScoreOverlayContextProps) {
  return (
    <div className="overlay-match-chip">
      <strong>{roundLabel(selectedSet, profile)}</strong>
    </div>
  );
}

export function BroadcastLayer({
  profile,
  selectedSet,
  logoUrl
}: ScoreOverlayContextProps & { logoUrl?: string }) {
  const { t } = useTranslation(['overlay', 'common']);
  const broadcast = selectedSet.broadcast;
  const matchDetails = [
    profile.overlay.showMatchChip === false ? roundLabel(selectedSet, profile) : undefined,
    phaseLabel(selectedSet),
    selectedSet.matchFormat === 'first-to'
      ? t('common:match.firstTo', { count: Math.ceil(selectedSet.bestOf / 2) })
      : t('common:match.bestOf', { count: selectedSet.bestOf }),
    stationLabel(selectedSet, t('common:match.stream'))
  ].filter(Boolean).join(' · ');
  const leftText = broadcast?.infoLeft?.trim();
  const rightText = broadcast?.infoRight?.trim();

  return (
    <aside
      className={`overlay-broadcast-layer ${profile.overlay.template}-broadcast logo-${profile.overlay.broadcastSafeZone.logoAnchor ?? 'bottom-center'}`}
      style={broadcastStyle(profile)}
      aria-label={t('broadcastInformation')}
    >
      {broadcast?.infoBarEnabled && leftText ? <div className="overlay-info-rail overlay-info-left">{leftText}</div> : null}
      <div className="overlay-logo-slot">
        {broadcast?.logoEnabled && logoUrl ? <BroadcastLogo src={logoUrl} /> : null}
      </div>
      <div className="overlay-info-rail overlay-match-context-rail">{matchDetails}</div>
      {broadcast?.infoBarEnabled && rightText ? <div className="overlay-info-rail overlay-info-right">{rightText}</div> : null}
    </aside>
  );
}

function BroadcastLogo({ src }: { src: string }) {
  return (
    <img
      className="is-loaded"
      src={src}
      alt=""
      aria-hidden="true"
      onLoad={(event) => { event.currentTarget.style.removeProperty('display'); }}
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />
  );
}

function roundLabel(selectedSet: SelectedSetState, profile: GameProfile): string {
  return selectedSet.round?.trim() || profile.terminology.set;
}

function stationLabel(selectedSet: SelectedSetState, fallback: string): string {
  return selectedSet.station?.trim() || fallback;
}

function phaseLabel(selectedSet: SelectedSetState): string {
  return [selectedSet.phase?.trim(), selectedSet.phaseGroup?.trim()].filter(Boolean).join(' · ');
}

function broadcastStyle(profile: GameProfile): BroadcastStyle {
  const safeZone = profile.overlay.broadcastSafeZone;
  return {
    '--broadcast-bottom': `${safeZone.bottom}px`,
    '--broadcast-height': `${safeZone.height}px`,
    '--broadcast-rail-width': `${safeZone.railWidth}px`,
    '--broadcast-center-width': `${safeZone.centerWidth}px`,
    '--broadcast-logo-height': `${safeZone.logoHeight}px`,
    '--broadcast-logo-top': `${safeZone.logoTop ?? 0}px`
  };
}
