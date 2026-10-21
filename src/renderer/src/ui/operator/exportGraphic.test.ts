// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountView } from '../../hooks/hookTestHarness';
import { DisplayText } from '../DisplayText';
import { exportGraphicAsPng } from './exportGraphic';

vi.mock('html-to-image', () => ({ toBlob: vi.fn(async () => new Blob(['background'], { type: 'image/png' })) }));

const mixedScriptNames = ['あいう/ABC', 'Long Player Name', 'Cafe\u0301 👩‍👩‍👧‍👦', 'か\u3099/GA'];
const pngOptions = { width: 1920, height: 1080, filename: 'top8.png', trustedText: mixedScriptNames };

beforeEach(() => {
  const css = document.createElement('style');
  css.id = 'export-font-test';
  css.textContent =
    readFileSync('src/renderer/src/ui/operator/topEight.css', 'utf8') +
    '\n' +
    readFileSync('src/renderer/src/ui/operator/generatorFonts.css', 'utf8') +
    '\n' +
    readFileSync('src/renderer/src/ui/displayText.css', 'utf8');
  document.head.append(css);
});

afterEach(() => {
  document.getElementById('export-font-test')?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('preserves wrapped mixed-script text, graphemes, and browser baselines in the PNG', async () => {
  const { drawn } = mockRasterExport();
  const source = await mountWrappedPreview();
  await exportGraphicAsPng(source, pngOptions);

  expect(drawn.map(({ text }) => text)).toEqual([
    'あい',
    'う',
    '/ABC',
    'LONG',
    'PLAYER NAME',
    'CAFÉ 👩‍👩‍👧‍👦',
    'が',
    '/GA'
  ]);
  expect(drawn[0]).toMatchObject({ x: 160, y: 168 });
  expect(drawn[0].font).toContain('700 54px');
  expect(drawn[0].font).toContain('Noto Sans CJK JP');
  expect(drawn[1]).toMatchObject({ x: 160, y: 252 });
  expect(drawn[2]).toMatchObject({ x: 214, y: 252 });
  expect(drawn[1].y - drawn[0].y).toBeGreaterThan(54);
  expect(drawn[2].font).toContain('400 54px');
  expect(drawn[2].font).toContain('JABS Anton');
  expect(drawn.every(({ font }) => font.includes('54px'))).toBe(true);
  expect(drawn[3].y).toBe(168);
  expect(drawn[4].y).toBe(232);
  expect(source.textContent).toBe(mixedScriptNames.join(''));
  expect([...source.querySelectorAll<HTMLElement>('strong')].every((name) => name.style.visibility === '')).toBe(true);
});

it('preserves kerning and right alignment for a spaced sponsor label', async () => {
  const { drawn } = mockRasterExport();
  const view = await mountView(() => h('section'));
  const source = view.container.querySelector('section')!;
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 40, 960, 540));
  const sponsor = document.createElement('span');
  sponsor.dataset.exportText = 'true';
  sponsor.textContent = 'AV';
  sponsor.style.cssText = 'font: normal 400 27px "JABS Bebas Neue"; letter-spacing: 2px; text-align: right;';
  source.append(sponsor);
  vi.spyOn(sponsor, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 100, 28));

  await exportGraphicAsPng(source, { ...pngOptions, filename: 'thumbnail.png', trustedText: ['AV'] });

  // Drawing A and V separately loses kerning and shifts the right edge.
  expect(drawn).toEqual([expect.objectContaining({ text: 'AV', x: 257 })]);
});

it('keeps joined text intact without native canvas letter spacing', async () => {
  const { drawn, context } = mockRasterExport();
  Reflect.deleteProperty(context, 'letterSpacing');
  const source = await mountWrappedPreview();

  await exportGraphicAsPng(source, pngOptions);

  expect(drawn.some(({ text }) => text === 'CAFÉ 👩‍👩‍👧‍👦')).toBe(true);
  expect(drawn.every(({ font }) => font.includes('54px'))).toBe(true);
  expect(context.scale).toHaveBeenCalled();
  expect(context.scale.mock.calls.every(([, vertical]) => vertical === 1)).toBe(true);
});

it('rejects preview text that differs from the approved export text', async () => {
  const source = document.createElement('section');
  source.textContent = 'Player One unexpected text';

  await expect(exportGraphicAsPng(source, { ...pngOptions, trustedText: ['Player One'] })).rejects.toThrow(
    'preview text changed'
  );
});

async function mountWrappedPreview() {
  const view = await mountView(() =>
    h(
      'section',
      { className: 'top8-canvas top8-mosaic' },
      mixedScriptNames.map((name) =>
        h(
          'span',
          { className: 'top8-name-row', key: name },
          h(
            'strong',
            {
              key: name,
              'data-export-text': 'wrapped',
              style: {
                fontFamily: '"JABS Anton", sans-serif',
                fontSize: '27px',
                fontWeight: '400',
                fontStyle: 'normal',
                color: 'white',
                letterSpacing: '-0.675px',
                textTransform: 'uppercase'
              }
            },
            h(DisplayText, { text: name })
          )
        )
      )
    )
  );
  const source = view.container.querySelector('section')!;
  expect(getComputedStyle(source.querySelector('strong')!).lineHeight).toBe('normal');
  expect(getComputedStyle(source.querySelector('strong')!).textWrap).toBe('wrap');
  expect(getComputedStyle(source.querySelector('.display-text-cjk')!).lineHeight).toBe('normal');
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 40, 960, 540));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.style.verticalAlign === 'baseline') {
      const font = (this.previousElementSibling as HTMLElement).style.fontFamily;
      return new DOMRect(0, font.includes('Noto Sans CJK JP') ? 30 : 24, 0, 0);
    }
    return new DOMRect();
  });
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  // The Japanese span wraps; its second line shares a baseline with /ABC.
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    const value = this.startContainer.textContent!;
    const parts = [...segmenter.segment(value)];
    const part = parts.find(({ index }) => index === this.startOffset);
    expect(part).toBeDefined();
    expect(this.endOffset).toBe(part!.index + part!.segment.length);
    const index = parts.indexOf(part!);
    if (value === 'が') return clientRects(new DOMRect(700, 94, 27, 36));
    if (value === '/GA') return clientRects(new DOMRect(727 + index * 12, 100, 12, 28));
    if (value === 'あいう')
      return index < 2
        ? clientRects(new DOMRect(100 + index * 27, 94, 27, 36))
        : clientRects(new DOMRect(154, 94, 0, 36), new DOMRect(100, 136, 27, 36));
    if (value === '/ABC') return clientRects(new DOMRect(127 + index * 12, 142, 12, 28));
    if (value === 'Long Player Name') {
      if (index === 4) return clientRects();
      return clientRects(
        index < 5 ? new DOMRect(300 + index * 12, 100, 12, 28) : new DOMRect(300 + (index - 5) * 12, 132, 12, 28)
      );
    }
    return clientRects(new DOMRect(500 + index * 12, 100, 12, 28));
  });
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
    if (this.startContainer instanceof HTMLElement) {
      expect(this.startContainer.parentElement?.getAttribute('aria-hidden')).toBe('true');
      const cjk = this.startContainer.style.fontFamily.includes('Noto Sans CJK JP');
      return new DOMRect(0, 0, 100, cjk ? 36 : 28);
    }
    // Combined bounds include the empty rectangle on the previous line.
    const rects = [...this.getClientRects()];
    if (!rects.length) return new DOMRect();
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    return new DOMRect(
      left,
      top,
      Math.max(...rects.map((rect) => rect.right)) - left,
      Math.max(...rects.map((rect) => rect.bottom)) - top
    );
  });
  return source;
}

function mockRasterExport() {
  const drawn: { text: string; x: number; y: number; font: string }[] = [];
  const context = {
    font: '',
    letterSpacing: '0px',
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn((_horizontal: number, _vertical: number) => undefined),
    measureText(text: string) {
      const size = Number(this.font.match(/([\d.]+)px/)?.[1]);
      const scale = size / 27;
      return {
        width: text.length * size - (text === 'AV' ? size / 6 : 0),
        // Some webviews provide only ink bounds, which vary with each glyph.
        actualBoundingBoxAscent: 20 * scale,
        actualBoundingBoxDescent: 0
      } as TextMetrics;
    },
    fillText(text: string, x: number, y: number) {
      drawn.push({ text, x, y, font: this.font });
    }
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['png'], { type: 'image/png' }))
  );
  vi.stubGlobal(
    'Image',
    class {
      onload?: () => void;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:jabs-export-test');
  return { drawn, context };
}

function clientRects(...rects: DOMRect[]): DOMRectList {
  return Object.assign(rects, { item: (index: number) => rects[index] });
}
