/** The Winner stinger's slide, silhouette hold and brief color impact. */
export function winnerSubjectKeyframes({
  from,
  rest,
  filter,
  delay,
  settled,
  duration,
  exitStart,
  tempo = 1
}: {
  from: string;
  rest: string;
  filter?: string;
  delay: number;
  settled: number;
  duration: number;
  exitStart?: number;
  tempo?: number;
}): Keyframe[] {
  const image = filter !== undefined;
  const shadow = filter && filter !== 'none' ? ` ${filter}` : '';
  const silhouette = image ? `brightness(0)${shadow}` : undefined;
  const highlight = `brightness(0) invert(0.22)${shadow}`;
  const impactTransform = `${rest === 'none' ? '' : rest} scale(1.035)`;
  const revealTempo = Math.min(tempo, ((exitStart ?? duration) - settled) / 500);
  const frames: Keyframe[] = [
    { offset: 0, opacity: 1, transform: from, filter: silhouette },
    ...(delay ? [{ offset: delay / duration, opacity: 1, transform: from, filter: silhouette }] : []),
    { offset: settled / duration, opacity: 1, transform: rest, filter: silhouette, easing: 'steps(1, end)' },
    ...(image
      ? [
          {
            offset: (settled + 180 * revealTempo) / duration,
            opacity: 1,
            transform: rest,
            filter: silhouette,
            easing: 'steps(1, end)'
          },
          {
            offset: (settled + 181 * revealTempo) / duration,
            opacity: 1,
            transform: impactTransform,
            filter: highlight,
            easing: 'steps(1, end)'
          },
          {
            offset: (settled + 330 * revealTempo) / duration,
            opacity: 1,
            transform: impactTransform,
            filter,
            easing: 'cubic-bezier(0.16, 0.8, 0.2, 1)'
          },
          { offset: (settled + 470 * revealTempo) / duration, opacity: 1, transform: rest, filter }
        ]
      : []),
    {
      offset: (exitStart ?? duration) / duration,
      opacity: 1,
      transform: rest,
      filter,
      easing: 'cubic-bezier(0.55, 0, 0.8, 0.45)'
    },
    ...(exitStart === undefined ? [] : [{ offset: 1, opacity: 1, transform: from, filter }])
  ];
  frames[delay ? 1 : 0].easing = 'cubic-bezier(0.22, 0.55, 0.3, 1)';
  return frames;
}
