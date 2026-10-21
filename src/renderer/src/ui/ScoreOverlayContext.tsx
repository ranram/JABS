import { DisplayText } from './DisplayText';
import { type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameProfile } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';
import { useMatchFormatLabel } from './useMatchFormatLabel';
import { displayPhaseName } from '@shared/matchContext';

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
    <div className="overlay-match-chip" data-entrance="round">
      <strong><DisplayText text={roundLabel(selectedSet, profile)} /></strong>
    </div>
  );
}

export function BroadcastLayer({
  profile,
  selectedSet,
  logoUrl
}: ScoreOverlayContextProps & { logoUrl?: string }) {
  const { t } = useTranslation('overlay');
  const matchLabel = useMatchFormatLabel(selectedSet);
  const broadcast = selectedSet.broadcast;
  const matchDetails = [
    profile.overlay.showMatchChip === false ? roundLabel(selectedSet, profile) : undefined,
    displayPhaseName(selectedSet.phase),
    matchLabel,
    selectedSet.station?.trim()
  ].filter(Boolean).join(' · ');
  const leftText = broadcast?.infoLeft?.trim();
  const rightText = broadcast?.infoRight?.trim();

  return (
    <aside
      className={`overlay-broadcast-layer ${profile.overlay.template}-broadcast logo-${profile.overlay.broadcastSafeZone.logoAnchor ?? 'bottom-center'}`}
      style={broadcastStyle(profile)}
      aria-label={t('broadcastInformation')}
    >
      {broadcast?.infoBarEnabled ? <div className="overlay-info-rail overlay-info-left" data-entrance="rail-left"><span className="overlay-info-text"><DisplayText text={leftText ?? ''} /></span></div> : null}
      <div className="overlay-logo-slot">
        {broadcast?.logoEnabled && logoUrl ? <BroadcastLogo src={logoUrl} /> : null}
      </div>
      <div className="overlay-info-rail overlay-match-context-rail" data-entrance="rail-center"><span className="overlay-info-text"><DisplayText text={matchDetails} /></span></div>
      {broadcast?.infoBarEnabled ? <div className="overlay-info-rail overlay-info-right" data-entrance="rail-right"><span className="overlay-info-text"><DisplayText text={rightText ?? ''} /></span></div> : null}
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
