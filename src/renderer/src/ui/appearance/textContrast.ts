type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

/** Computed colors used by the bundled scoreboards (including CSS color-mix results). */
export function parseColor(color: string): Rgba | undefined {
  if (color === 'transparent') return [0, 0, 0, 0];
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(color)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((part) => part + part).join('') : hex;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
      full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1
    ];
  }
  const match = /^(rgba?\(|color\(srgb\s+)([^)]+)\)$/.exec(color);
  if (!match) return;
  const parts = match[2].trim().split(/[\s,/]+/);
  if (parts.length < 3 || parts.length > 4) return;
  const srgb = match[1].startsWith('color');
  const values = parts.map((part, index) => {
    const value = Number(part.replace(/%$/, ''));
    return value * (part.endsWith('%') ? (index === 3 ? 0.01 : 2.55) : index < 3 && srgb ? 255 : 1);
  });
  if (values.some((value) => !Number.isFinite(value))) return;
  return [clamp(values[0], 255), clamp(values[1], 255), clamp(values[2], 255), clamp(values[3] ?? 1, 1)];
}

function clamp(value: number, maximum: number) {
  return Math.min(maximum, Math.max(0, value));
}

export function compositeColor(foreground: Rgba, background: Rgb): Rgb {
  const channel = (index: number) => foreground[index] * foreground[3] + background[index] * (1 - foreground[3]);
  return [channel(0), channel(1), channel(2)];
}

function luminance(color: Rgb) {
  const linear = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(first: Rgb, second: Rgb) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Preserve readable colors and adjust others just enough to meet the contrast target. */
export function readableTextColor(color: string, background: Rgb, minimum = 4.5): string | undefined {
  const parsed = parseColor(color);
  if (!parsed) return;
  const original = compositeColor(parsed, background);
  if (contrastRatio(original, background) >= minimum) return color;
  // Check rounded RGB values so the final color still meets the contrast target.
  for (let step = 1; step <= 255; step++) {
    for (const endpoint of [255, 0]) {
      const channel = (index: number) => Math.round(original[index] + ((endpoint - original[index]) * step) / 255);
      const mixed: Rgb = [channel(0), channel(1), channel(2)];
      if (contrastRatio(mixed, background) >= minimum) return `rgb(${mixed.join(', ')})`;
    }
  }
}

export function accentTextColor(color: string) {
  const parsed = parseColor(color);
  const background: Rgb = parsed ? [parsed[0], parsed[1], parsed[2]] : [0, 0, 0];
  return contrastRatio([0, 0, 0], background) >= contrastRatio([255, 255, 255], background) ? '#000000' : '#ffffff';
}
