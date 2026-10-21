import { waapi, type WAAPIAnimation } from 'animejs/waapi';

export type EntranceCue = {
  target: string;
  from: 'left' | 'right' | 'top' | 'bottom' | { x?: number; y?: number; scale?: number };
  delay?: number;
  duration?: number;
  movementDuration?: number;
  fade?: boolean;
  silhouette?: boolean;
  transient?: boolean;
  punch?: boolean;
  boundary?: 'screen' | 'parent';
  ease?: string;
  revealDelay?: number;
};

export function playOverlayEntrance(root: HTMLElement | SVGSVGElement, cues: readonly EntranceCue[]) {
  const bounds = root.getBoundingClientRect();
  // Read placement before starting any animation, including CSS centering transforms.
  const frames = cues.flatMap((cue) => {
    const target = root.querySelector<HTMLElement | SVGElement>(`[data-entrance="${cue.target}"]`);
    if (!target) return [];
    const rect = target.getBoundingClientRect();
    const boundary = cue.boundary === 'parent' ? (target.parentElement?.getBoundingClientRect() ?? bounds) : bounds;
    const style = getComputedStyle(target);
    const base = style.transform === 'none' ? '' : style.transform;
    let x = 0;
    let y = 0;
    let scale = 1;
    switch (cue.from) {
      case 'left':
        x = boundary.left - rect.right - 16;
        break;
      case 'right':
        x = boundary.right - rect.left + 16;
        break;
      case 'top':
        y = boundary.top - rect.bottom - 16;
        break;
      case 'bottom':
        y = boundary.bottom - rect.top + 16;
        break;
      default:
        ({ x = 0, y = 0, scale = 1 } = cue.from);
    }
    const filter = style.filter === 'none' ? '' : style.filter;
    return [{ cue, target, base, filter, x, y, scale, opacity: Number(style.opacity) || 1 }];
  });
  const animations: WAAPIAnimation[] = [];
  const revert = () => {
    for (const animation of animations.splice(0)) animation.revert();
  };
  const release = (animation: WAAPIAnimation) => {
    const index = animations.indexOf(animation);
    if (index === -1) return;
    animations.splice(index, 1);
    animation.revert();
  };
  try {
    for (const { cue, target, base, filter, x, y, scale, opacity } of frames) {
      const shadow = 'brightness(0) opacity(1) blur(1px)';
      const revealed = `brightness(1) opacity(1) blur(0px) ${filter}`.trim();
      const duration = cue.duration ?? 480;
      const fadeDuration = Math.min(400, duration);
      const movementDuration = Math.min(cue.movementDuration ?? duration, duration);
      const revealStart = Math.min(
        duration - 1,
        cue.revealDelay ??
          (cue.movementDuration === undefined ? fadeDuration : Math.max(fadeDuration, movementDuration))
      );
      const fromTransform = `translate3d(${x}px, ${y}px, 0) ${base} scale(${scale})`;
      const toTransform = base || 'none';
      const transformFrames = cue.punch
        ? [fromTransform, `translate3d(0, 0, 0) ${base} scale(0.96)`, toTransform]
        : [fromTransform, toTransform];
      const animation = waapi.animate(target, {
        ...(x || y || scale !== 1
          ? {
              transform:
                cue.punch || cue.movementDuration === undefined
                  ? transformFrames
                  : { from: fromTransform, to: toTransform, duration: movementDuration, ease: 'outSine' }
            }
          : {}),
        ...(cue.transient
          ? { opacity: [0, 1, 1, 0] }
          : cue.fade
            ? {
                opacity: cue.silhouette
                  ? { from: 0, to: opacity, duration: fadeDuration, ease: 'outSine' }
                  : [0, opacity]
              }
            : {}),
        // Portraits finish their shorter slide before revealing color inside the frame.
        ...(cue.silhouette
          ? {
              filter: {
                from: shadow,
                to: revealed,
                delay: (cue.delay ?? 0) + revealStart,
                duration: Math.max(1, duration - revealStart)
              }
            }
          : {}),
        delay: cue.delay ?? 0,
        duration,
        ease: cue.ease ?? (cue.transient ? 'linear' : cue.silhouette ? 'inOutSine' : 'cubic-bezier(0.16, 1, 0.3, 1)'),
        onComplete: release
      });
      animations.push(animation);
      // Native completion also releases effects when browser finish events are delayed.
      // Leaving Program cancels playback, which rejects these promises.
      if (animation.animations.length) {
        void Promise.all(animation.animations.map((native) => native.finished)).then(
          () => release(animation),
          () => undefined
        );
      }
    }
  } catch (error) {
    revert();
    throw error;
  }
  return revert;
}
