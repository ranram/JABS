import type { PlayerState } from '@shared/models';
import type { MediaLayerKind, MediaTransform } from '@shared/mediaPlacement';
import type { VersusScreenState } from '@shared/versusScreen';
import { PlayerMediaLayers } from '../PlayerMediaLayers';
import { CharacterPortraitStrip } from '../CharacterPortraitStrip';
import type { SubjectMedia } from '../useVersusMedia';

export type VersusPlacementControls = {
  preview?: boolean;
  selectedLayer?: { player: 0 | 1; layer: MediaLayerKind };
  onSelectLayer?(player: 0 | 1, layer: MediaLayerKind): void;
  onPlacementChange?(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform): void;
};

export function VersusPlayer({
  player,
  index,
  media,
  settings,
  mediaReady,
  preview,
  selectedLayer,
  onSelectLayer,
  onPlacementChange
}: VersusPlacementControls & {
  player: PlayerState;
  index: 0 | 1;
  media: SubjectMedia;
  settings: VersusScreenState;
  mediaReady: boolean;
}) {
  const side = index === 0 ? 'left' : 'right';
  return (
    <div className={`versus-player-viewport versus-player-viewport-${side}`}>
      <section className={`versus-player versus-player-${side}`} aria-label={player.name}>
        <div className="versus-subject">
          <PlayerMediaLayers
            mode={settings.mediaMode}
            name={player.name}
            characterUrl={media.characterUrl}
            photoUrl={media.photoUrl}
            photoReady={mediaReady}
            characterClass="versus-character"
            photoClass="versus-photo"
            placement={settings.mediaPlacements[index]}
            coordinateSpace={preview ? 'preview' : 'overlay'}
            characterEntrance={`image-${side}`}
            photoEntrance={settings.mediaMode === 'combined' ? `photo-${side}` : `image-${side}`}
            selectedLayer={selectedLayer?.player === index ? selectedLayer.layer : undefined}
            onSelect={preview && onSelectLayer ? (layer) => onSelectLayer(index, layer) : undefined}
            onChange={preview && onPlacementChange ? (layer, next) => onPlacementChange(index, layer, next) : undefined}
          />
        </div>
        <CharacterPortraitStrip
          portraits={settings.mediaMode !== 'photo' ? (media.characterPortraits ?? []) : []}
          className="versus-character-portraits"
          side={side}
          entrance={`portraits-${side}`}
        />
      </section>
    </div>
  );
}
