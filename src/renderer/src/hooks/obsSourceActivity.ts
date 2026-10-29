const initialActivity = {
  active: undefined as boolean | undefined,
  visible: undefined as boolean | undefined,
  activation: 0
};
let activity = initialActivity;
const subscribers = new Set<() => void>();
let listening = false;

type ObsActivityCallbacks = {
  onActiveChange?(active: boolean): void;
  onVisibilityChange?(visible: boolean): void;
};

function setActive(next: unknown) {
  if (typeof next !== 'boolean' || next === activity.active) return;
  activity = {
    ...activity,
    active: next,
    // Retain quick off/on transitions even if React combines both updates.
    activation: activity.activation + (next ? 1 : 0)
  };
  for (const notify of subscribers) notify();
}

function setVisible(visible: unknown) {
  if (typeof visible !== 'boolean' || visible === activity.visible) return;
  activity = { ...activity, visible };
  for (const notify of subscribers) notify();
}

function onActiveChanged(event: Event) {
  setActive((event as CustomEvent<{ active?: unknown }>).detail?.active);
}

function onVisibleChanged(event: Event) {
  setVisible((event as CustomEvent<{ visible?: unknown }>).detail?.visible);
}

// Track activity before React mounts so its subscribers receive startup changes.
export function trackObsSourceActivity() {
  const obs = (window as Window & { obsstudio?: ObsActivityCallbacks }).obsstudio;
  const previousActive = obs?.onActiveChange;
  const previousVisible = obs?.onVisibilityChange;
  const activeCallback = (active: boolean) => {
    setActive(active);
    previousActive?.call(obs, active);
  };
  const visibleCallback = (visible: boolean) => {
    setVisible(visible);
    previousVisible?.call(obs, visible);
  };
  if (!listening) {
    window.addEventListener('obsSourceActiveChanged', onActiveChanged);
    window.addEventListener('obsSourceVisibleChanged', onVisibleChanged);
    // Keep direct OBS callbacks as a fallback for missing custom events.
    if (obs) {
      obs.onActiveChange = activeCallback;
      obs.onVisibilityChange = visibleCallback;
    }
    listening = true;
  }
  return () => {
    window.removeEventListener('obsSourceActiveChanged', onActiveChanged);
    window.removeEventListener('obsSourceVisibleChanged', onVisibleChanged);
    if (obs?.onActiveChange === activeCallback) obs.onActiveChange = previousActive;
    if (obs?.onVisibilityChange === visibleCallback) obs.onVisibilityChange = previousVisible;
    listening = false;
    activity = initialActivity;
  };
}

export function subscribeObsSourceActivity(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

export function getObsSourceActivity() {
  return activity;
}
