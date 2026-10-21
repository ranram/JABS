import { useLogoAssetUrl } from '../../hooks/useLogoAssetUrl';
import { useEffect, useRef, useState } from 'react';
import type { MediaLayerKind, MediaTransform } from '@shared/mediaPlacement';
import type { SelectedSetState } from '@shared/models';
import { versusPresentationMode, type VersusScreenState } from '@shared/versusScreen';
import { VersusPresentation } from '../VersusOverlay';
import { useVersusMedia } from '../useVersusMedia';
import './versusPreview.css';

type VersusPreviewProps = {
  activeSet: SelectedSetState;
  settings: VersusScreenState;
  selectedLayer?: { player: 0 | 1; layer: MediaLayerKind };
  onSelectLayer(player: 0 | 1, layer: MediaLayerKind): void;
  onPlacementChange(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform): void;
};

export function VersusPreview({
  activeSet,
  settings,
  selectedLayer,
  onSelectLayer,
  onPlacementChange
}: VersusPreviewProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const { media } = useVersusMedia(activeSet);
  const mode = versusPresentationMode(activeSet);
  const logoAssetId = settings.logoAssetId ?? activeSet.broadcast?.logoAssetId;
  const logoUrl = useLogoAssetUrl(mode !== 'waiting' && settings.showTournamentLogo ? logoAssetId : undefined);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => setScale(shell.clientWidth / 1920);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={shellRef} className={`versus-preview-shell${settings.showBackground ? '' : ' is-transparent-preview'}`}>
      <div className="versus-preview-stage" style={{ transform: `scale(${scale})` }}>
        <VersusPresentation
          selectedSet={activeSet}
          settings={settings}
          media={media}
          logoUrl={logoUrl}
          preview
          selectedLayer={selectedLayer}
          onSelectLayer={onSelectLayer}
          onPlacementChange={onPlacementChange}
        />
      </div>
    </div>
  );
}
