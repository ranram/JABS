import { useEffect } from 'react';
import { api } from '../../api';

const settleMs = 400;
const minimumCheckIntervalMs = 5_000;

export function useAssetRefreshOnReturn() {
  useEffect(() => {
    let leftApp = false;
    let nextCheckAt = 0;
    let timer: number | undefined;
    let pending: AbortController | undefined;
    let active = true;

    async function check() {
      timer = undefined;
      if (!active || pending) return;
      nextCheckAt = Date.now() + minimumCheckIntervalMs;
      pending = new AbortController();
      try {
        await api.checkAssets(pending.signal);
      } catch {
        // A failed background check leaves the current artwork in place.
      } finally {
        pending = undefined;
      }
    }

    function leave() {
      leftApp = true;
      window.clearTimeout(timer);
    }
    function returned() {
      if (!leftApp) return;
      leftApp = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), Math.max(settleMs, nextCheckAt - Date.now()));
    }

    window.addEventListener('blur', leave);
    window.addEventListener('focus', returned);
    return () => {
      active = false;
      window.clearTimeout(timer);
      pending?.abort();
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', returned);
    };
  }, []);
}
