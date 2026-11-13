import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { SelectedSetState } from '@shared/models';
import { getObsSourceActivity, subscribeObsSourceActivity } from '../hooks/obsSourceActivity';
import { useAppearance } from './appearance/AppearanceProvider';
import { playerPresentationIdentity } from './mediaIdentity';

export function useScoreboardSwap(
  rootRef: RefObject<HTMLElement | null>,
  selectedSet: SelectedSetState | undefined,
  enabled: boolean
) {
  const { appearance } = useAppearance();
  const { active, activation } = useSyncExternalStore(subscribeObsSourceActivity, getObsSourceActivity);
  const allowed = enabled && appearance.entranceAnimations && active !== false;
  const context = JSON.stringify([
    selectedSet?.setId,
    selectedSet?.eventId,
    selectedSet?.gameId,
    selectedSet?.assetCatalogSlug,
    selectedSet?.videogameId,
    selectedSet?.customScoreboardId
  ]);
  const one = playerPresentationIdentity(selectedSet?.playerOne);
  const two = playerPresentationIdentity(selectedSet?.playerTwo);
  const previous = useRef<
    { context: string; one?: string; two?: string; allowed: boolean; activation: number } | undefined
  >(undefined);
  const animations = useRef(new Set<Animation>());

  function stop() {
    for (const animation of animations.current) animation.cancel();
    animations.current.clear();
  }

  useLayoutEffect(() => stop, []);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { context, one, two, allowed, activation };
    stop();
    const root = rootRef.current;
    if (
      !allowed ||
      !before?.allowed ||
      before.activation !== activation ||
      before.context !== context ||
      !one ||
      !two ||
      one === two ||
      before.one !== two ||
      before.two !== one ||
      !root ||
      root.hasAttribute('data-entrance-pending') ||
      typeof Element.prototype.animate !== 'function'
    )
      return;

    try {
      for (const text of root.querySelectorAll<HTMLElement>('[data-scoreboard-swap-text]')) {
        const offset = text.dataset.scoreboardSwapText === 'left' ? -20 : 20;
        const animation = text.animate(
          [
            { translate: `${offset}px 0`, opacity: 0 },
            { translate: '0px 0', opacity: 1 }
          ],
          { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' }
        );
        animations.current.add(animation);
        void animation.finished.then(
          () => {
            if (animations.current.delete(animation)) animation.cancel();
          },
          () => animations.current.delete(animation)
        );
      }
    } catch {
      stop();
    }
  }, [rootRef, context, one, two, allowed, activation]);
}
