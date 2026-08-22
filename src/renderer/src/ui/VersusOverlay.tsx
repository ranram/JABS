import { useEffect, useState, type CSSProperties } from 'react';
import { resolveGameProfile } from '@shared/gameProfiles';
import type { PlayerMediaMatch, PlayerState, SelectedSetState } from '@shared/models';
import type { MediaLayerKind, MediaTransform } from '@shared/mediaPlacement';
import type { VersusScreenState } from '@shared/versusScreen';
import { api } from '../api';
import { useOverlayState } from '../hooks/useOverlayState';
import { useVersusScreenState } from '../hooks/useVersusScreenState';
import { AdjustableMediaImage } from './operator/AdjustableMediaImage';
import { displayFlagUrl, isPrideDisplayFlag } from './overlayPlayerPresentation';
import './versusOverlay.css';
import { playerCharacters, playerPortraitCharacters } from '@shared/characterTeams';
import { loadCharacterPortraits, type CharacterPortrait } from '../characterPortraits';
import { CharacterPortraitStrip } from './CharacterPortraitStrip';

export type SubjectMedia = {
  characterUrl?: string;
  photoUrl?: string;
  sponsorUrl?: string;
  characterPortraits?: CharacterPortrait[];
  hasCatalogCharacterMedia?: boolean;
};

export function VersusOverlay() {
  const { state: overlayState, error: overlayError } = useOverlayState();
  const { state: settings, error: settingsError } = useVersusScreenState();
  const selectedSet = overlayState?.selectedSet;
  const media = useVersusMedia(selectedSet);
  const logoUrl = useTournamentLogo(selectedSet, settings?.showTournamentLogo ?? true);
  if (!selectedSet || !settings) return <main className="overlay versus-overlay" />;
  return <VersusPresentation selectedSet={selectedSet} settings={settings} media={media} logoUrl={logoUrl} connectionError={Boolean(overlayError || settingsError)} />;
}

export function VersusPresentation({
  selectedSet,
  settings,
  media,
  logoUrl,
  preview = false,
  selectedLayer,
  onSelectLayer,
  onPlacementChange,
  connectionError = false
}: {
  selectedSet: SelectedSetState;
  settings: VersusScreenState;
  media: [SubjectMedia, SubjectMedia];
  logoUrl?: string;
  preview?: boolean;
  selectedLayer?: { player: 0 | 1; layer: MediaLayerKind };
  onSelectLayer?(player: 0 | 1, layer: MediaLayerKind): void;
  onPlacementChange?(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform): void;
  connectionError?: boolean;
}) {
  const profile = resolveGameProfile(settings.stylingGameId);
  const headToHead = settings.history?.headToHead ?? [];
  const playerOneSeriesWins = headToHead.filter((set) => set.playerOneScore > set.playerTwoScore).length;
  const playerTwoSeriesWins = headToHead.filter((set) => set.playerTwoScore > set.playerOneScore).length;
  return (
    <main className={`overlay versus-overlay ${profile.overlay.themeClass}${preview ? ' versus-preview-canvas' : ''}`}>
      <div className="versus-atmosphere" />
      <VersusPlayer side="left" playerIndex={0} player={selectedSet.playerOne} media={media[0]} settings={settings} preview={preview} selectedLayer={selectedLayer} onSelectLayer={onSelectLayer} onPlacementChange={onPlacementChange} />
      <VersusPlayer side="right" playerIndex={1} player={selectedSet.playerTwo} media={media[1]} settings={settings} preview={preview} selectedLayer={selectedLayer} onSelectLayer={onSelectLayer} onPlacementChange={onPlacementChange} />
      <section className="versus-center-card">
        <header>
          {logoUrl && <img src={logoUrl} alt="" />}
          <span>{[selectedSet.phase, selectedSet.phaseGroup, selectedSet.round].filter(Boolean).join(' · ')}</span>
          <strong>VS</strong>
        </header>
        <div className="versus-history-grid">
          <PlacementList name={selectedSet.playerOne.name} placements={settings.history?.playerOnePlacements ?? []} />
          <PlacementList name={selectedSet.playerTwo.name} placements={settings.history?.playerTwoPlacements ?? []} />
        </div>
        <div className="versus-h2h">
          <h2><span>Latest head-to-head</span>{headToHead.length > 0 && <strong>{playerOneSeriesWins}–{playerTwoSeriesWins}</strong>}</h2>
          {headToHead.length ? headToHead.map((set, index) => {
            const playerOneWon = set.playerOneScore > set.playerTwoScore;
            return (
            <div className="versus-h2h-row" key={`${set.tournamentName}-${set.completedAt ?? index}`}>
              <b className={`versus-h2h-outcome ${playerOneWon ? 'is-win' : 'is-loss'}`}>{playerOneWon ? 'W' : 'L'}</b>
              <strong>{set.playerOneScore}</strong>
              <span>{set.tournamentName}</span>
              <strong>{set.playerTwoScore}</strong>
              <b className={`versus-h2h-outcome ${playerOneWon ? 'is-loss' : 'is-win'}`}>{playerOneWon ? 'L' : 'W'}</b>
            </div>
          );}) : <p>No recorded head-to-head sets</p>}
        </div>
      </section>
      {connectionError && <div className="overlay-connection-status">Reconnecting…</div>}
    </main>
  );
}

function VersusPlayer({ side, playerIndex, player, media, settings, preview, selectedLayer, onSelectLayer, onPlacementChange }: {
  side: 'left' | 'right';
  playerIndex: 0 | 1;
  player: PlayerState;
  media: SubjectMedia;
  settings: VersusScreenState;
  preview: boolean;
  selectedLayer?: { player: 0 | 1; layer: MediaLayerKind };
  onSelectLayer?(player: 0 | 1, layer: MediaLayerKind): void;
  onPlacementChange?(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform): void;
}) {
  const layer = settings.mediaMode;
  const src = layer === 'character' ? media.characterUrl : media.photoUrl;
  const className = layer === 'character' ? 'versus-character' : 'versus-photo';
  const transform = settings.mediaPlacements[playerIndex][layer];
  const flagUrl = displayFlagUrl(player.country, player.displayFlag);
  const prideFlag = isPrideDisplayFlag(player.displayFlag);
  const team = playerCharacters(player);
  const identityContext = [
    player.pronouns,
    player.seed ? `Seed ${player.seed}` : undefined
  ].filter(Boolean);
  const showCharacterNames = settings.mediaMode === 'character'
    && !media.hasCatalogCharacterMedia
    && team.length > 0;
  return (
    <section className={`versus-player versus-player-${side}`}>
      <div className="versus-subject">
        {settings.showSponsorLogos && media.sponsorUrl && <img className="versus-sponsor" src={media.sponsorUrl} alt="" />}
        {src && (preview && onSelectLayer && onPlacementChange ? (
          <AdjustableMediaImage
            src={src}
            className={className}
            label={`${player.name} ${layer}`}
            mirrorX={layer === 'character' && side === 'right'}
            transform={transform}
            selected={selectedLayer?.player === playerIndex && selectedLayer.layer === layer}
            onSelect={() => onSelectLayer(playerIndex, layer)}
            onChange={(next) => onPlacementChange(playerIndex, layer, next)}
          />
        ) : <img className={className} src={src} alt="" style={mediaTransformStyle(transform, layer === 'character' && side === 'right')} />)}
      </div>
      <CharacterPortraitStrip
        portraits={settings.mediaMode === 'character' ? (media.characterPortraits ?? []) : []}
        className="versus-character-portraits"
        side={side}
      />
      <div className="versus-identity">
        {player.prefix && <span>{player.prefix}</span>}
        <span className="versus-name-row">
          {side === 'left' && flagUrl && <img className={`versus-country-flag${prideFlag ? ' is-pride' : ''}`} src={flagUrl} alt="" />}
          <strong>{player.name}</strong>
          {side === 'right' && flagUrl && <img className={`versus-country-flag${prideFlag ? ' is-pride' : ''}`} src={flagUrl} alt="" />}
        </span>
        {identityContext.length > 0 && (
          <small className="versus-player-context">{identityContext.join(' · ')}</small>
        )}
        {showCharacterNames && (
          <small className="versus-character-team">
            {team.map((character) => <span key={character}>{character}</span>)}
          </small>
        )}
      </div>
    </section>
  );
}

function PlacementList({ name, placements }: {
  name: string;
  placements: Array<{ placement: number; tournamentName: string }>;
}) {
  return <div className="versus-placements"><h2>{name}</h2>{placements.length ? placements.map((item, index) => (
    <div key={`${item.tournamentName}-${index}`}><strong>#{item.placement}</strong><span>{item.tournamentName}</span></div>
  )) : <p>No recent placements</p>}</div>;
}

export function useVersusMedia(selectedSet: SelectedSetState | undefined): [SubjectMedia, SubjectMedia] {
  const [media, setMedia] = useState<[SubjectMedia, SubjectMedia]>([{}, {}]);
  useEffect(() => {
    let active = true;
    if (!selectedSet) { setMedia([{}, {}]); return () => { active = false; }; }
    setMedia([{}, {}]);
    const slug = selectedSet.assetCatalogSlug ?? selectedSet.gameId;
    void Promise.all([api.playerMedia(), api.gameCharacterAssets(slug)]).then(async ([matches, assets]) => {
      const hasCatalogCharacterMedia = assets.assets.some(
        (asset) => Boolean(asset.assetId || asset.portraitAssetId)
      );
      async function resolve(player: PlayerState, match: PlayerMediaMatch): Promise<SubjectMedia> {
        const team = playerCharacters(player);
        const character = assets.assets.find((asset) => asset.character === team[0]);
        const [characterUrl, photoUrl, sponsorUrl, characterPortraits] = await Promise.all([
          character?.assetId ? api.gameCharacterAssetUrl(slug, character.assetId) : undefined,
          match.playerPhotoAssetId ? api.playerPhotoAssetUrl(match.playerPhotoAssetId) : undefined,
          match.sponsorLogoAssetId ? api.sponsorLogoAssetUrl(match.sponsorLogoAssetId) : undefined,
          loadCharacterPortraits(slug, playerPortraitCharacters(player), assets.assets)
        ]);
        return { characterUrl, photoUrl, sponsorUrl, characterPortraits, hasCatalogCharacterMedia };
      }
      const next = await Promise.all([
        resolve(selectedSet.playerOne, matches.playerOne),
        resolve(selectedSet.playerTwo, matches.playerTwo)
      ]) as [SubjectMedia, SubjectMedia];
      if (active) setMedia(next);
    }).catch(() => { if (active) setMedia([{}, {}]); });
    return () => { active = false; };
  }, [selectedSet]);
  return media;
}

export function useTournamentLogo(selectedSet: SelectedSetState | undefined, enabled: boolean) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    if (!enabled) { setUrl(undefined); return () => { active = false; }; }
    void api.logos().then(async ({ logos }) => {
      const logo = logos.find((item) => item.id === selectedSet?.broadcast?.logoAssetId) ?? logos[0];
      const next = logo ? await api.logoAssetUrl(logo.id) : undefined;
      if (active) setUrl(next);
    }).catch(() => { if (active) setUrl(undefined); });
    return () => { active = false; };
  }, [enabled, selectedSet?.broadcast?.logoAssetId]);
  return url;
}

function mediaTransformStyle(transform: MediaTransform, mirror: boolean): CSSProperties {
  return {
    transform: `translate3d(${transform.x * 960}px, ${transform.y * 1080}px, 0) scale(${transform.scale})${mirror ? ' scaleX(-1)' : ''}`
  };
}
