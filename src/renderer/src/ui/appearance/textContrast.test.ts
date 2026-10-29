import { expect, it } from 'vitest';
import { accentTextColor, compositeColor, contrastRatio, parseColor, readableTextColor } from './textContrast';

it('understands computed sRGB colors and composites translucent layers', () => {
  expect(parseColor('color(srgb 0.1 0.2 0.3 / 0.5)')).toEqual([25.5, 51, 76.5, 0.5]);
  expect(parseColor('rgba(20, 40, 60, 0.25)')).toEqual([20, 40, 60, 0.25]);
  expect(parseColor('rgb(100% 0% 0% / 50%)')?.[0]).toBeCloseTo(255);
  expect(parseColor('#1238')).toEqual([17, 34, 51, 136 / 255]);
  expect(compositeColor([200, 100, 50, 0.25], [20, 40, 60])).toEqual([65, 55, 57.5]);
  expect(parseColor('color(display-p3 1 0 0)')).toBeUndefined();
  expect(parseColor('rgb(nope 0 0)')).toBeUndefined();
  expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBe(21);
});

it('keeps readable colors and adjusts dark, light and saturated palettes against their backing', () => {
  expect(readableTextColor('#112233', [255, 240, 206])).toBe('#112233');
  expect(readableTextColor('#ffeecc', [18, 12, 9])).toBe('#ffeecc');
  for (const background of [
    [18, 12, 9],
    [255, 240, 206],
    [100, 100, 100]
  ] as const) {
    for (const color of ['#000000', '#112233', '#445566', '#ffffff', '#ffff00', '#0000ff', '#ff0000', '#747474']) {
      const result = readableTextColor(color, background)!;
      expect(result).toBeTruthy();
      const parsed = parseColor(result)!;
      expect(
        contrastRatio([parsed[0], parsed[1], parsed[2]], background),
        `${color} on ${background}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
  const tinted = parseColor(readableTextColor('#112233', [18, 12, 9])!)!;
  expect(tinted[2]).toBeGreaterThan(tinted[1]);
  expect(tinted[1]).toBeGreaterThan(tinted[0]);
  expect(readableTextColor('rgba(255, 255, 255, 0.05)', [0, 0, 0])).not.toBe('rgba(255, 255, 255, 0.05)');
});

it('selects readable text on solid primary and secondary accent fills', () => {
  expect(accentTextColor('#000000')).toBe('#ffffff');
  expect(accentTextColor('#112233')).toBe('#ffffff');
  expect(accentTextColor('#ffffff')).toBe('#000000');
  expect(accentTextColor('#ffff00')).toBe('#000000');
});
