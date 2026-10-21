import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { StingerCue } from '@shared/stingers';
import { api } from '../../api';
import { useStingers } from '../../hooks/useStingers';
import { getObsSourceActivity, subscribeObsSourceActivity } from '../../hooks/obsSourceActivity';
import { StingerStage } from './StingerStage';

export function StingersOverlay() {
  const { state, error } = useStingers();
  const activity = useSyncExternalStore(subscribeObsSourceActivity, getObsSourceActivity);
  const pageVisible = useSyncExternalStore(subscribeVisibility, isVisible);
  const [clientId] = useState(() => crypto.randomUUID());
  const [cue, setCue] = useState<StingerCue>();
  const [reloading, setReloading] = useState(false);
  const connection = useRef<string | undefined>(undefined);
  const attempted = useRef<string | undefined>(undefined);
  const inObs = Boolean((window as Window & { obsstudio?: unknown }).obsstudio);
  const program = activity.active === true;
  // OBS may load an already-active page without sending a fresh activation event.
  const visible = activity.visible ?? pageVisible;
  const active = inObs && (program || visible) && activity.active !== false && !error && !reloading;
  const currentCue = useRef(cue);
  currentCue.current = cue;

  useEffect(() => {
    const id = state?.connectionId;
    if (!id) return;
    const previous = connection.current;
    connection.current = id;
    if (!inObs || !previous || previous === id) return;
    let disposed = false;
    setReloading(true);
    setCue(undefined);
    // Renew OBS's activity bindings as well as the data stream. Re-registering
    // the old page alone cannot clear a stale inactive/hidden state.
    void api
      .stingerSource(clientId, false, false)
      .catch(() => undefined)
      .then(() => {
        if (!disposed) window.location.reload();
      });
    return () => {
      disposed = true;
    };
  }, [state?.connectionId, clientId, inObs]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    async function heartbeat() {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        await api.stingerSource(clientId, active, program);
      } catch {
        if (!disposed) setCue(undefined);
      } finally {
        inFlight = false;
      }
    }
    void heartbeat();
    const timer = active ? window.setInterval(() => void heartbeat(), 1500) : undefined;
    if (!active) setCue(undefined);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [clientId, active, program]);

  useEffect(
    () => () => {
      // A new page receives a new ID; a stale source cannot reclaim a consumed cue.
      void api.stingerSource(clientId, false, false).catch(() => undefined);
    },
    [clientId]
  );

  useEffect(() => {
    if (!active || error) {
      setCue(undefined);
      return;
    }
    const offered = state?.cue;
    if (!offered) {
      setCue(undefined);
      return;
    }
    if (currentCue.current && currentCue.current.id !== offered.id) setCue(undefined);
    if (attempted.current === offered.id || offered.claimed) return;
    attempted.current = offered.id;
    let disposed = false;
    void api
      .claimStinger(clientId, offered.id)
      .then(({ cue: claimed }) => {
        if (!disposed && claimed) setCue(claimed);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [state?.cue?.id, active, Boolean(error), clientId]);

  const finish = useCallback(
    (cueId: string, failure?: string) => {
      const playing = currentCue.current;
      if (!playing || playing.id !== cueId) return;
      setCue(undefined);
      void api.finishStinger(clientId, cueId, failure).catch(() => undefined);
    },
    [clientId]
  );

  return (
    <main className="stinger-obs">
      {cue && <StingerStage key={cue.id} cue={cue} onFinish={(error) => finish(cue.id, error)} />}
    </main>
  );
}

function isVisible() {
  return document.visibilityState !== 'hidden';
}
function subscribeVisibility(notify: () => void) {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
}
