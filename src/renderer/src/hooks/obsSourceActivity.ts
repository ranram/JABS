const initialActivity = {
  active: undefined as boolean | undefined,
  visible: undefined as boolean | undefined,
  activation: 0
};
let activity = initialActivity;
const subscribers = new Set<() => void>();
let listening = false;

function onActiveChanged(event: Event) {
  const next = (event as CustomEvent<{ active?: unknown }>).detail?.active;
  if (typeof next !== 'boolean' || next === activity.active) return;
  activity = {
    ...activity,
    active: next,
    // Retain quick off/on transitions even if React combines both updates.
    activation: activity.activation + (next ? 1 : 0)
  };
  for (const notify of subscribers) notify();
}

function onVisibleChanged(event: Event) {
  const visible = (event as CustomEvent<{ visible?: unknown }>).detail?.visible;
  if (typeof visible !== 'boolean' || visible === activity.visible) return;
  activity = { ...activity, visible };
  for (const notify of subscribers) notify();
}

// Start before React loads so an OBS activation during startup is not lost.
export function trackObsSourceActivity() {
  if (!listening) {
    window.addEventListener('obsSourceActiveChanged', onActiveChanged);
    window.addEventListener('obsSourceVisibleChanged', onVisibleChanged);
    listening = true;
  }
  return () => {
    window.removeEventListener('obsSourceActiveChanged', onActiveChanged);
    window.removeEventListener('obsSourceVisibleChanged', onVisibleChanged);
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
