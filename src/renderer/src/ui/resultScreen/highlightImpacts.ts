import type { EntranceCue } from '../overlayEntrance';

export function highlightImpactCues(entrances: readonly EntranceCue[]): EntranceCue[] {
  const impacts = [
    { target: 'victory-character', strength: 5, flash: 0.42 },
    { target: 'victory-photo', strength: 6, flash: 0.5 },
    { target: 'highlight-name', strength: 2, flash: 0 },
    { target: 'highlight-title', strength: 8, flash: 0.6 }
  ].map((impact) => {
    const entrance = entrances.find((cue) => cue.target === impact.target)!;
    return { ...impact, at: (entrance.delay ?? 0) + (entrance.duration ?? 480) };
  });
  const duration = Math.max(...impacts.map(({ at }) => at)) + 280;
  const rest = 'translate3d(0px, 0px, 0)';
  return [
    {
      target: 'highlight-stage',
      from: {},
      duration,
      keyframes: (root) => [
        { offset: 0, transform: rest },
        ...impacts.flatMap(({ target, strength, at }): Keyframe[] =>
          root.querySelector(`[data-entrance="${target}"]`)
            ? [
                { offset: at / duration, transform: rest },
                { offset: (at + 35) / duration, transform: `translate3d(${-strength}px, 1px, 0)` },
                { offset: (at + 80) / duration, transform: `translate3d(${strength * 0.65}px, -1px, 0)` },
                { offset: (at + 130) / duration, transform: `translate3d(${-strength * 0.35}px, 0.5px, 0)` },
                { offset: (at + 210) / duration, transform: rest }
              ]
            : []
        ),
        { offset: 1, transform: rest }
      ]
    },
    {
      target: 'highlight-impact',
      from: {},
      duration,
      keyframes: (root) => [
        { offset: 0, opacity: 0 },
        ...impacts.flatMap(({ target, flash, at }): Keyframe[] =>
          flash && root.querySelector(`[data-entrance="${target}"]`)
            ? [
                { offset: at / duration, opacity: 0 },
                { offset: (at + 12) / duration, opacity: flash },
                { offset: (at + 180) / duration, opacity: 0 }
              ]
            : []
        ),
        { offset: 1, opacity: 0 }
      ]
    }
  ];
}
