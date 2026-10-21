import { useCallback } from 'react';
import type { SelectedSetState } from '@shared/models';
import type { LibraryIdentity } from '@shared/playerLibrary';
import { api } from '../../api';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { useRealtimeState } from '../../hooks/useRealtimeState';

export type VersusProfile = { age?: number | null; nickname?: string | null };
const noMessage = () => undefined;

/** Read library-only details without copying them into the editable match draft. */
export function useVersusProfiles(set?: SelectedSetState): VersusProfile[] {
  const revision = useCatalogRevision();
  const key = JSON.stringify(
    [set?.playerOne, set?.playerTwo].map((player) => ({
      localPlayerId: player?.localPlayerId,
      playerId: player?.playerId
    }))
  );
  const load = useCallback(async () => {
    const identities: LibraryIdentity[] = JSON.parse(key);
    const players = identities.some((id) => id.localPlayerId || id.playerId)
      ? await api.resolvePlayers(identities, '')
      : [];
    return { key, players };
  }, [key, revision]);
  const { state } = useRealtimeState({ load, parseMessage: noMessage, loadError: 'Unable to load library details.' });
  return state?.key === key ? state.players.map((player) => player ?? {}) : [];
}
