import { useTranslation } from 'react-i18next';
import { useAppearanceStyle, withBroadcastLanguage } from './appearance/AppearanceProvider';
import { useLogoAssetUrl } from '../hooks/useLogoAssetUrl';
import { resolveGameProfile } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';
import { historyForMatch, versusPresentationMode, type VersusScreenState } from '@shared/versusScreen';
import { useOverlayState } from '../hooks/useOverlayState';
import { useVersusScreenState } from '../hooks/useVersusScreenState';
import { useVersusMedia, type SubjectMedia } from './useVersusMedia';
import { useOverlayEntrance } from './useOverlayEntrance';
import { versusEntrance } from './versusEntrance';
import { mediaInteractionKey } from './mediaIdentity';
import { VersusPlayer, type VersusPlacementControls } from './versus/VersusPlayer';
import { VersusMatchCard } from './versus/VersusMatchCard';
import { useVersusProfiles } from './versus/useVersusProfiles';
import { useVersusDetails } from './versus/useVersusDetails';
import { VersusFrame } from './versus/VersusFrame';
import './versusOverlay.css';

export function VersusOverlay() {
  const { state: overlayState, error: overlayError } = useOverlayState();
  const { state: settings, error: settingsError } = useVersusScreenState();
  const selectedSet = overlayState?.selectedSet;
  const mode = versusPresentationMode(selectedSet);
  const { media, ready } = useVersusMedia(selectedSet);
  const logoAssetId = settings?.logoAssetId ?? selectedSet?.broadcast?.logoAssetId;
  const logoUrl = useLogoAssetUrl(mode !== 'waiting' && settings?.showTournamentLogo ? logoAssetId : undefined);
  if (!settings) return <main className="overlay" />;
  if (!selectedSet) {
    return <main className={`overlay versus-overlay${settings.showBackground ? '' : ' is-transparent-background'}`} />;
  }
  return (
    <VersusPresentation
      selectedSet={selectedSet}
      settings={settings}
      media={media}
      mediaReady={ready}
      logoUrl={logoUrl}
      connectionError={Boolean(overlayError || settingsError)}
    />
  );
}

type PresentationProps = VersusPlacementControls & {
  selectedSet: SelectedSetState;
  settings: VersusScreenState;
  media: [SubjectMedia, SubjectMedia];
  logoUrl?: string;
  mediaReady?: boolean;
  connectionError?: boolean;
};

function VersusPresentationContent({
  selectedSet,
  settings,
  media,
  logoUrl,
  mediaReady = true,
  connectionError = false,
  ...controls
}: PresentationProps) {
  const { t } = useTranslation('common');
  const appearanceStyle = useAppearanceStyle();
  const profile = resolveGameProfile(settings.stylingGameId);
  const mode = versusPresentationMode(selectedSet);
  const profiles = useVersusProfiles(mode === 'waiting' ? undefined : selectedSet);
  const history = historyForMatch(settings, selectedSet);
  const { rows, tickers } = useVersusDetails(
    selectedSet,
    settings,
    profiles,
    selectedSet.tournamentName ?? history?.tournamentName
  );
  const key = JSON.stringify([
    mode,
    selectedSet.setId,
    selectedSet.playerOne.entrantId,
    selectedSet.playerTwo.entrantId
  ]);
  const entranceRef = useOverlayEntrance(versusEntrance, !controls.preview && mode !== 'waiting', mediaReady, key);
  const className = `overlay versus-overlay ${profile.overlay.themeClass}${mode === 'exhibition' ? ' versus-exhibition' : ''}${settings.showBackground ? '' : ' is-transparent-background'}${controls.preview ? ' versus-preview-canvas' : ''}`;
  if (mode === 'waiting') return <main className={className} />;
  return (
    <main className={className} ref={entranceRef} style={appearanceStyle}>
      <div className="versus-atmosphere" />
      <VersusFrame tickers={tickers} preview={controls.preview} />
      <VersusPlayer
        key={mediaInteractionKey(selectedSet.playerOne, [
          0,
          selectedSet.setId,
          selectedSet.eventId,
          selectedSet.assetCatalogSlug ?? selectedSet.gameId,
          selectedSet.videogameId
        ])}
        index={0}
        player={selectedSet.playerOne}
        media={media[0]}
        mediaReady={mediaReady}
        settings={settings}
        {...controls}
      />
      <VersusPlayer
        key={mediaInteractionKey(selectedSet.playerTwo, [
          1,
          selectedSet.setId,
          selectedSet.eventId,
          selectedSet.assetCatalogSlug ?? selectedSet.gameId,
          selectedSet.videogameId
        ])}
        index={1}
        player={selectedSet.playerTwo}
        media={media[1]}
        mediaReady={mediaReady}
        settings={settings}
        {...controls}
      />
      <VersusMatchCard
        set={selectedSet}
        settings={settings}
        history={history}
        media={media}
        rows={rows}
        logoUrl={logoUrl}
      />
      {connectionError && <div className="overlay-connection-status">{t('status.reconnecting')}</div>}
    </main>
  );
}

export const VersusPresentation = withBroadcastLanguage(VersusPresentationContent);
