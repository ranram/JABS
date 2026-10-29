import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { StingerCue } from '@shared/stingers';
import { api } from '../../api';
import { useStingers } from '../../hooks/useStingers';
import { getObsSourceActivity, subscribeObsSourceActivity } from '../../hooks/obsSourceActivity';
import { StingerStage } from './StingerStage';

export function StingersOverlay() {
  const { state, error } = useStingers();
  const activity = useSyncExternalStore(subscribeObsSourceActivity, getObsSourceActivity);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [cue, setCue] = useState<StingerCue>();
  const connection = useRef<string | undefined>(undefined);
  const attempted = useRef<string | undefined>(undefined);
  const inObs = Boolean((window as Window & { obsstudio?: unknown }).obsstudio);
  const program = activity.active === true;
  // Browser occlusion does not mean the source left OBS's scene. Until OBS
  // reports activity, keep the loaded source eligible; confirmed Program wins.
  const visible = activity.visible !== false;
  const active = inObs && (program || visible) && activity.active !== false && !error;
  const currentCue = useRef(cue);
  currentCue.current = cue;

  useEffect(() => {
    const id = state?.connectionId;
    if (!id) return;
    const previous = connection.current;
    connection.current = id;
    if (!inObs || !previous || previous === id) return;
    setCue(undefined);
    // A new registration retires the old owner without reloading OBS's page.
    setClientId(crypto.randomUUID());
  }, [state?.connectionId, inObs]);

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
      // Retire this registration on reconnect or page unload.
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
