type TextRun = {
  text: string;
  rect: DOMRect;
  color: string;
  font: { family: string; size: number; style: string; weight: string };
  letterSpacing: number;
  direction: CanvasDirection;
  shadow: string;
};

export type ExportTextRun = TextRun & { baseline: number };

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Use the preview's line breaks and font spans. Fitting the whole name onto
// one line makes wrapped names smaller and leaves their reserved space empty.
export function captureWrappedText(element: HTMLElement): ExportTextRun[] {
  const runs: TextRun[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent) continue;
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    let run: TextRun | undefined;
    for (const { segment, index } of graphemes.segment(node.textContent ?? '')) {
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      // At a wrap, WebKit can include an empty rectangle on the previous line.
      // Its combined bounds put the character on that line during PNG export.
      const rect = [...range.getClientRects()].find(({ width, height }) => width > 0 && height > 0);
      if (!rect) continue;
      const text = transformText(segment, style.textTransform);
      if (run && Math.abs(run.rect.top - rect.top) < 0.5 && Math.abs(run.rect.bottom - rect.bottom) < 0.5) {
        run.text += text;
        const left = Math.min(run.rect.left, rect.left);
        const right = Math.max(run.rect.right, rect.right);
        run.rect = new DOMRect(left, rect.top, right - left, rect.height);
      } else {
        run = {
          text,
          rect,
          color: style.color,
          font: {
            family: style.fontFamily,
            size: pixels(style.fontSize),
            style: style.fontStyle,
            weight: style.fontWeight
          },
          letterSpacing: pixels(style.letterSpacing),
          direction: style.direction === 'rtl' ? 'rtl' : 'ltr',
          shadow: style.textShadow
        };
        runs.push(run);
      }
    }
  }
  if (!runs.length && element.textContent?.trim()) {
    throw new Error('JABS could not read the player name layout.');
  }
  return measureBrowserBaselines(runs);
}

function measureBrowserBaselines(runs: TextRun[]): ExportTextRun[] {
  const probe = document.createElement('span');
  const text = document.createElement('span');
  const marker = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;white-space:pre;line-height:normal;';
  marker.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline;';
  probe.append(text, marker);
  document.body.append(probe);
  const range = document.createRange();
  try {
    return runs.map((run) => {
      text.style.font = `${run.font.style} ${run.font.weight} ${run.font.size}px ${run.font.family}`;
      text.style.letterSpacing = `${run.letterSpacing}px`;
      text.textContent = run.text;
      range.selectNodeContents(text);
      // A zero-height inline block sits on the browser's actual text baseline.
      // Canvas ink bounds vary with the letters and cannot reliably locate it.
      const offset = marker.getBoundingClientRect().top - range.getBoundingClientRect().top;
      return { ...run, baseline: run.rect.top + offset };
    });
  } finally {
    probe.remove();
  }
}

export function drawWrappedText(
  context: CanvasRenderingContext2D,
  runs: ExportTextRun[],
  sourceRect: DOMRect,
  scaleX: number,
  scaleY: number
): void {
  for (const run of runs) {
    context.save();
    const fontSize = run.font.size * scaleY;
    context.font = `${run.font.style} ${run.font.weight} ${fontSize}px ${run.font.family}`;
    context.fillStyle = run.color;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.direction = run.direction;
    const nativeLetterSpacing = Reflect.has(context, 'letterSpacing');
    if (nativeLetterSpacing) context.letterSpacing = `${run.letterSpacing * scaleX}px`;
    const x = (run.rect.left - sourceRect.left) * scaleX;
    const y = (run.baseline - sourceRect.top) * scaleY;
    applyTextShadow(context, run.shadow, scaleY);
    const metrics = context.measureText(run.text);
    if (!nativeLetterSpacing && run.letterSpacing && metrics.width) {
      // Older webviews still draw a complete run so joined letters and emoji
      // stay intact. Match its preview width without changing its height.
      context.translate(x, y);
      context.scale((run.rect.width * scaleX) / metrics.width, 1);
      context.fillText(run.text, 0, 0);
    } else {
      context.fillText(run.text, x, y);
    }
    context.restore();
  }
}

function transformText(value: string, transform: string): string {
  if (transform === 'uppercase') return value.toLocaleUpperCase();
  if (transform === 'lowercase') return value.toLocaleLowerCase();
  return value;
}

export function applyTextShadow(context: CanvasRenderingContext2D, value: string, scale: number): void {
  if (!value || value === 'none') return;
  const color = value.match(/rgba?\([^)]+\)|#[\da-f]{3,8}/i)?.[0];
  const sizes = [...value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
  if (color) context.shadowColor = color;
  context.shadowOffsetX = (sizes[0] ?? 0) * scale;
  context.shadowOffsetY = (sizes[1] ?? 0) * scale;
  context.shadowBlur = Math.max(0, ...sizes.slice(2).map((size) => size * scale));
}

function pixels(value: string): number {
  return Number.parseFloat(value) || 0;
}
