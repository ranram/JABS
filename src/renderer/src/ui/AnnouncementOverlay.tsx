import { useAppearanceStyle, withBroadcastLanguage } from './appearance/AppearanceProvider';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveGameProfile, type GameProfile } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';
import type { ResultScreenState } from '@shared/resultScreen';
import { playerCharacters, playerPortraitCharacters } from '@shared/characterTeams';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import { api } from '../api';
import { loadCharacterPortraits, type CharacterPortrait } from '../characterPortraits';
import { useCatalogRevision } from '../hooks/useCatalogRevision';
import { useLogoAsset } from '../hooks/useLogoAssetUrl';
import { useResultScreenState } from '../hooks/useResultScreenState';
import { announcementPresentation } from './announcementPresentation';
import { CharacterPortraitStrip } from './CharacterPortraitStrip';
import { DisplayText } from './DisplayText';
import { CatalogImage } from './CatalogImage';
import { useOverlayEntrance } from './useOverlayEntrance';
import { resultScreenEntrance } from './resultScreenEntrance';
import { VictoryComposition } from './resultScreen/VictoryComposition';
import { victoryEntrance } from './resultScreen/victoryEntrance';
import { spotlightEntrance } from './resultScreen/spotlightEntrance';
import { phaseAndRound } from '@shared/matchContext';
import playerPlaceholder from '../assets/player_placeholder.svg';

const resultEntrances = {
  classic: resultScreenEntrance,
  victory: victoryEntrance,
  spotlight: spotlightEntrance
};

type PlayerMediaUrls = { sponsorLogoUrl?: string; playerPhotoUrl?: string };
type OverlayMediaUrls = { playerOne: PlayerMediaUrls; playerTwo: PlayerMediaUrls; ready: boolean };

function AnnouncementOverlayContent({
  profile,
  selectedSet,
  reconnecting
}: {
  profile: GameProfile;
  selectedSet: SelectedSetState;
  reconnecting: boolean;
}) {
  const { t } = useTranslation(['overlay', 'common']);
  const appearanceStyle = useAppearanceStyle();
  const presentation = announcementPresentation(selectedSet);
  const winner = presentation?.winner;
  const winnerCharacters = winner ? playerCharacters(winner) : [];
  const { state: savedSettings } = useResultScreenState();
  const settings = savedSettings ?? defaultResultScreenSettings;
  const composition = settings.composition;
  const playerMedia = usePlayerMediaUrls(
    selectedSet,
    Boolean(savedSettings && winner && (settings.showPlayerPhoto || settings.showSponsorLogo))
  );
  const winnerMedia = winner === selectedSet.playerOne ? playerMedia.playerOne : playerMedia.playerTwo;
  const stylingProfile = resolveGameProfile(savedSettings?.stylingGameId ?? profile.id);
  const characterMedia = useAnnouncementCharacterMedia(
    selectedSet.assetCatalogSlug ?? selectedSet.gameId,
    savedSettings?.showCharacter ? winnerCharacters[0] : undefined,
    savedSettings?.showCharacter ? winner?.characterAssetId : undefined,
    savedSettings?.showCharacter && winner ? playerPortraitCharacters(winner) : []
  );
  const { characterUrl, characterPortraits } = characterMedia;
  const photoUrl = settings.showPlayerPhoto
    ? (winnerMedia.playerPhotoUrl ?? (playerMedia.ready ? playerPlaceholder : undefined))
    : undefined;
  const sponsorLogoUrl = settings.showSponsorLogo ? winnerMedia.sponsorLogoUrl : undefined;
  const { url: resultLogoUrl, ready: logoReady } = useLogoAsset(
    savedSettings?.showTournamentLogo ? (savedSettings.logoAssetId ?? selectedSet.broadcast?.logoAssetId) : undefined
  );
  const mediaReady = characterMedia.ready && playerMedia.ready && logoReady;
  // A new result gets an entrance; score and style edits keep the current presentation.
  const resultKey = JSON.stringify([
    composition,
    selectedSet.setId,
    selectedSet.eventId,
    selectedSet.gameId,
    presentation?.kind,
    selectedSet.playerOne.entrantId ?? selectedSet.playerOne.name,
    selectedSet.playerTwo.entrantId ?? selectedSet.playerTwo.name,
    winner === selectedSet.playerOne ? 'one' : 'two'
  ]);
  const entranceRef = useOverlayEntrance(
    resultEntrances[composition],
    Boolean(savedSettings && winner),
    mediaReady,
    resultKey
  );
  if (!savedSettings) return <main className="overlay" />;
  const mediaClass = [photoUrl && 'has-photo', characterUrl && 'has-character', sponsorLogoUrl && 'has-sponsor']
    .filter(Boolean)
    .join(' ');

  if (composition !== 'classic') {
    return (
      <main
        ref={entranceRef}
        style={appearanceStyle}
        className={`overlay victory${composition === 'spotlight' ? ' spotlight' : ''} ${stylingProfile.overlay.themeClass}${settings.showBackground ? '' : ' is-transparent-background'}${settings.showTextBackdrop ? ' has-text-backdrop' : ''}`}
        data-announcement-surface="result"
        data-announcement-composition={composition}
        data-announcement-kind={presentation?.kind ?? 'winner'}
      >
        {winner && (
          <VictoryComposition
            variant={composition}
            winner={winner}
            kind={presentation?.kind ?? 'winner'}
            round={phaseAndRound(selectedSet)}
            characterNames={
              settings.showCharacter && characterMedia.ready && !characterMedia.hasCatalogMedia ? winnerCharacters : []
            }
            characterUrl={characterUrl}
            photoUrl={photoUrl}
            sponsorLogoUrl={sponsorLogoUrl}
            logoUrl={resultLogoUrl}
            portraits={characterPortraits}
          />
        )}
        {reconnecting && (
          <div className="overlay-connection-status" role="status">
            {t('common:status.reconnecting')}
          </div>
        )}
      </main>
    );
  }

  return (
    <main
      ref={entranceRef}
      style={appearanceStyle}
      className={`overlay overlay-announcement overlay-announcement-${presentation?.kind ?? 'winner'} ${stylingProfile.overlay.themeClass}${settings.showBackground ? '' : ' is-transparent-background'}`}
      data-game-id={profile.id}
      data-announcement-surface="result"
      data-announcement-composition="classic"
      data-announcement-kind={presentation?.kind}
    >
      {winner && (
        <section className="announcement-composition" data-entrance="result-layout">
          <div className={`announcement-subject ${mediaClass}`} aria-hidden="true">
            {sponsorLogoUrl && (
              <CatalogImage className="announcement-sponsor-watermark" src={sponsorLogoUrl} entrance="result-sponsor" />
            )}
            {mediaReady && !characterUrl && !photoUrl && !sponsorLogoUrl && (
              <span className="announcement-subject-placeholder" data-entrance="result-placeholder">
                <DisplayText text={winner.name} initial />
              </span>
            )}
            {characterUrl && (
              <CatalogImage className="announcement-character-art" src={characterUrl} entrance="result-character" />
            )}
            {photoUrl && (
              <CatalogImage
                className="announcement-player-photo"
                src={photoUrl}
                fallbackSrc={playerPlaceholder}
                entrance="result-photo"
              />
            )}
            <CharacterPortraitStrip
              portraits={characterPortraits}
              className="announcement-character-portraits"
              side="right"
              entrance="result-portraits"
            />
          </div>
          <div className="announcement-copy">
            <span className="announcement-kicker" data-entrance="result-kicker">
              {presentation?.kind === 'champion' ? t('championAnnouncement') : t('winnerAnnouncement')}
            </span>
            <strong data-entrance="result-name">
              <DisplayText text={winner.name} />
            </strong>
            {settings.showCharacter &&
              characterMedia.ready &&
              !characterMedia.hasCatalogMedia &&
              winnerCharacters.length > 0 && (
                <span className="announcement-character" data-entrance="result-character-label">
                  <DisplayText text={winnerCharacters.join(' / ')} />
                </span>
              )}
            <small data-entrance="result-round">
              <DisplayText text={phaseAndRound(selectedSet)} />
            </small>
          </div>
          {resultLogoUrl && (
            <CatalogImage className="announcement-tournament-logo" src={resultLogoUrl} entrance="result-logo" />
          )}
        </section>
      )}
      {reconnecting && (
        <div className="overlay-connection-status" role="status">
          {t('common:status.reconnecting')}
        </div>
      )}
    </main>
  );
}

const defaultResultScreenSettings: ResultScreenState = {
  composition: 'classic',
  stylingGameId: 'street-fighter-6',
  showBackground: true,
  showTextBackdrop: false,
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
  ready: boolean;
} {
  const [media, setMedia] = useState<{
    characterUrl?: string;
    characterPortraits: CharacterPortrait[];
    hasCatalogMedia: boolean;
    key: string;
  }>();
  const revision = useCatalogRevision();
  const portraitKey = portraitCharacters.join('\u0000');
  const key = JSON.stringify([gameId, leadCharacter, characterAssetId, portraitKey]);
  useEffect(() => {
    let active = true;
    if (!leadCharacter && !portraitKey) {
      return () => {
        active = false;
      };
    }
    void api
      .gameCharacterAssets(gameId)
      .then(async ({ assets }) => {
        const selectedAssetId = selectedCharacterAssetId(
          {
            character: leadCharacter,
            characterAssetId
          },
          assets
        );
        const hasCatalogMedia = assets.some((asset) => Boolean(asset.assetId || asset.portraitAssetId));
        const selectedPortraits = portraitKey ? portraitKey.split('\u0000') : [];
        const [characterUrl, characterPortraits] = await Promise.all([
          selectedAssetId ? api.gameCharacterAssetUrl(gameId, selectedAssetId) : undefined,
          loadCharacterPortraits(gameId, selectedPortraits, assets)
        ]);
        if (active) setMedia({ key, characterUrl, characterPortraits, hasCatalogMedia });
      })
      .catch(() => {
        if (active)
          setMedia((current) =>
            current?.key === key ? current : { key, characterPortraits: [], hasCatalogMedia: false }
          );
      });
    return () => {
      active = false;
    };
  }, [key, revision]);
  return {
    ...(media?.key === key ? media : { characterPortraits: [], hasCatalogMedia: false }),
    ready: (!leadCharacter && !portraitKey) || media?.key === key
  };
}

function usePlayerMediaUrls(selectedSet: SelectedSetState | undefined, enabled: boolean): OverlayMediaUrls {
  const revision = useCatalogRevision();
  const key =
    enabled && selectedSet
      ? JSON.stringify([
          selectedSet.setId,
          selectedSet.eventId,
          selectedSet.playerOne.name,
          selectedSet.playerOne.playerPhotoAssetId,
          selectedSet.playerOne.prefix,
          selectedSet.playerOne.sponsor,
          selectedSet.playerTwo.name,
          selectedSet.playerTwo.playerPhotoAssetId,
          selectedSet.playerTwo.prefix,
          selectedSet.playerTwo.sponsor
        ])
      : undefined;
  const [media, setMedia] = useState<{ key: string; playerOne: PlayerMediaUrls; playerTwo: PlayerMediaUrls }>();
  useEffect(() => {
    let active = true;
    if (!selectedSet || !key) {
      return () => {
        active = false;
      };
    }

    void api
      .playerMedia()
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
        if (active) setMedia({ key, playerOne, playerTwo });
      })
      .catch(() => {
        if (active) setMedia((current) => (current?.key === key ? current : { key, playerOne: {}, playerTwo: {} }));
      });
    return () => {
      active = false;
    };
  }, [key, revision]);
  return {
    ...(key && media?.key === key ? media : { playerOne: {}, playerTwo: {} }),
    ready: !key || media?.key === key
  };
}

export const AnnouncementOverlay = withBroadcastLanguage(AnnouncementOverlayContent);
