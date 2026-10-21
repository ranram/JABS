import { useOverlayState } from './useOverlayState';

export function useBroadcastLogo(preferredAssetId?: string, enabled = true) {
  const { state } = useOverlayState();
  return enabled ? preferredAssetId ?? state?.selectedSet?.broadcast?.logoAssetId : undefined;
}
