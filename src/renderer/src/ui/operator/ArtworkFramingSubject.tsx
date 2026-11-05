import type { MediaLayerKind, MediaTransform, PlayerMediaPlacement } from '@shared/mediaPlacement';
import { clampArtworkTransform } from '@shared/artworkFraming';
import { CombinedMediaEditor } from '../combinedMedia/CombinedMediaEditor';
import { ResultArtwork } from '../resultScreen/ResultArtwork';
import playerPlaceholder from '../../assets/player_placeholder.svg';

export function ArtworkFramingSubject({
  name,
  side,
  layout,
  theme,
  characterUrl,
  photoUrl,
  placement,
  selected,
  onSelect,
  onChange
}: {
  name: string;
  side: 0 | 1;
  layout: 'stats' | 'classic' | 'victory' | 'spotlight';
  theme: string;
  characterUrl?: string;
  photoUrl?: string;
  placement: PlayerMediaPlacement;
  selected?: MediaLayerKind;
  onSelect(layer: MediaLayerKind): void;
  onChange(layer: MediaLayerKind, transform: MediaTransform): void;
}) {
  return (
    <div
      className={`overlay artwork-preview-subject ${layout === 'classic' ? 'overlay-announcement' : 'victory'} ${layout === 'stats' ? 'spotlight player-stats' : layout === 'spotlight' ? 'spotlight' : ''} ${theme}`}
      data-player={side + 1}
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
