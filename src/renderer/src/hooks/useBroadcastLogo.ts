import { useOverlayState } from './useOverlayState';

export function useBroadcastLogo(fallbackAssetId?: string, enabled = true) {
  const { state } = useOverlayState();
  return enabled ? state?.selectedSet?.broadcast?.logoAssetId ?? fallbackAssetId : undefined;
}
