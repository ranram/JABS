import { expect, it } from 'vitest';
import { highlightLayout } from './highlightLayout';

it('groups artwork below the name and centers a single subject', () => {
  for (const [photo, character] of [
    [true, true],
    [true, false],
    [false, true]
  ]) {
    const layout = highlightLayout(photo, character, true);
    for (const [visible, region] of [
      [photo, layout.photo],
      [character, layout.character]
    ] as const) {
      if (!visible) continue;
      expect(region.y).toBeGreaterThan(190);
      expect(region.y + region.height).toBeGreaterThan(1040);
      if (photo !== character) expect(region.x + region.width / 2).toBe(960);
    }
    expect(highlightLayout(photo, character, false).photo.y).toBeLessThan(layout.photo.y);
  }
  const pair = highlightLayout(true, true, true);
  expect(pair.character.height).toBeGreaterThan(pair.photo.height);
  const photoCenter = pair.photo.x + pair.photo.width / 2;
  const characterCenter = pair.character.x + pair.character.width / 2;
  expect((photoCenter + characterCenter) / 2).toBe(960);
  expect(characterCenter - photoCenter).toBeLessThan(720);
});

it('aligns the visible character top near the name across image proportions and padding', () => {
  for (const aspectRatio of [0.45, 640 / 900, 1.8]) {
    for (const top of [0, 0.04, 0.2]) {
      const frame = { top, aspectRatio };
      for (const name of [false, true]) {
        const layout = highlightLayout(true, true, name, frame);
        const height = Math.min(layout.character.height, layout.character.width / aspectRatio);
        expect(layout.character.y + top * height).toBeCloseTo(name ? 132 : 64);
        expect(layout.photo).toEqual(highlightLayout(true, true, name).photo);
      }
    }
  }
});
