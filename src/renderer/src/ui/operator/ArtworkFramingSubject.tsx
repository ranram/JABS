import type { MediaLayerKind, MediaTransform, PlayerMediaPlacement } from '@shared/mediaPlacement';
import { clampArtworkTransform } from '@shared/artworkFraming';
import { CombinedMediaEditor } from '../combinedMedia/CombinedMediaEditor';
import { ResultArtwork } from '../resultScreen/ResultArtwork';
import { HighlightComposition } from '../resultScreen/HighlightComposition';
import type { ResultScreenState } from '@shared/resultScreen';
import type { PlayerState } from '@shared/models';
import playerPlaceholder from '../../assets/player_placeholder.svg';
import { useAppearanceStyle } from '../appearance/AppearanceProvider';
import type { HighlightArtworkFrame } from '../resultScreen/highlightArtwork';

export function ArtworkFramingSubject({
  player,
  side,
  layout,
  showBackground,
  theme,
  characterUrl,
  characterFrame,
  photoUrl,
  sponsorUrl,
  highlightSettings,
  placement,
  selected,
  onSelect,
  onChange
}: {
  player: PlayerState;
  side: 0 | 1;
  layout: 'stats' | 'classic' | 'victory' | 'spotlight' | 'highlight';
  showBackground: boolean;
  theme: string;
  characterUrl?: string;
  characterFrame?: HighlightArtworkFrame;
  photoUrl?: string;
  sponsorUrl?: string;
  highlightSettings?: Pick<ResultScreenState, 'showIdentity' | 'showWinnerTitle' | 'showSponsorLogo'>;
  placement: PlayerMediaPlacement;
  selected?: MediaLayerKind;
  onSelect(layer: MediaLayerKind): void;
  onChange(layer: MediaLayerKind, transform: MediaTransform): void;
}) {
  const name = player.name;
  const appearanceStyle = useAppearanceStyle();
  return (
    <div
      className={`overlay artwork-preview-subject ${layout === 'classic' ? 'overlay-announcement' : 'victory'} ${layout === 'stats' ? 'spotlight player-stats' : layout === 'spotlight' ? 'spotlight' : layout === 'highlight' ? 'highlight' : ''} ${theme}${showBackground ? '' : ' is-transparent-background'}`}
      data-player={side + 1}
      style={appearanceStyle}
    >
      {layout === 'classic' ? (
        <section className="announcement-composition">
          <div className={`announcement-subject${characterUrl ? ' has-character' : ''}${photoUrl ? ' has-photo' : ''}`}>
            <CombinedMediaEditor
              name={name}
              characterUrl={characterUrl}
              photoUrl={photoUrl}
              characterClass="announcement-character-art"
              photoClass="announcement-player-photo"
              photoFallback={playerPlaceholder}
              placement={placement}
              selected={selected}
              onSelect={onSelect}
              onChange={onChange}
              className="artwork-combined-editor"
              clampTransform={clampArtworkTransform}
            />
          </div>
          <div className="announcement-copy">
            <strong>{name}</strong>
          </div>
        </section>
      ) : layout === 'highlight' ? (
        <HighlightComposition
          winner={player}
          kind="winner"
          characterUrl={characterUrl}
          characterFrame={characterFrame}
          photoUrl={photoUrl}
          sponsorLogoUrl={highlightSettings?.showSponsorLogo ? sponsorUrl : undefined}
          placement={placement}
          showIdentity={highlightSettings?.showIdentity ?? true}
          showWinnerTitle={highlightSettings?.showWinnerTitle ?? true}
          showConfetti={false}
          ready
          presentationKey="preview"
          editing={{ selected, label: name, onSelect, onChange }}
        />
      ) : (
        <section className="victory-composition">
          <ResultArtwork
            characterUrl={characterUrl}
            photoUrl={photoUrl}
            placement={placement}
            editing={{ selected, label: name, onSelect, onChange }}
          />
          <header className={layout === 'stats' ? 'stats-identity' : 'victory-copy'}>
            <strong className="victory-name">{name}</strong>
          </header>
        </section>
      )}
    </div>
  );
}
