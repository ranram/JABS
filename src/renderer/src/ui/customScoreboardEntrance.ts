import type { EntranceCue } from './overlayEntrance';

const playerFields = ['Flag', 'XHandle', 'Name', 'Pronouns', 'Seed', 'Score'] as const;

// The imported artwork is one image. Keep it in place and move JABS details gently
// so the entrance still fits the designer's layout.
export const customScoreboardEntrance: readonly EntranceCue[] = [
  { target: 'custom-frame', from: {}, fade: true, duration: 1200 },
  ...(['One', 'Two'] as const).flatMap((side) => playerFields.map((field) => ({
    target: `player${side}${field}`,
    from: { x: side === 'One' ? -32 : 32 },
    fade: true,
    delay: 120,
    duration: 1680
  }))),
  { target: 'matchLabel', from: { y: -24 }, fade: true, delay: 80, duration: 1680 },
  { target: 'logo', from: {}, fade: true, delay: 200, duration: 1200 },
  { target: 'infoLeft', from: { x: -32 }, fade: true, delay: 160, duration: 1680 },
  { target: 'infoRight', from: { x: 32 }, fade: true, delay: 160, duration: 1680 },
  { target: 'infoCenter', from: { y: 24 }, fade: true, delay: 160, duration: 1680 }
];
