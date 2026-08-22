import { toBlob } from 'html-to-image';

type ExportGraphicOptions = {
  width: number;
  height: number;
  filename: string;
  trustedText: readonly string[];
};

type ImageLayer = {
  image: HTMLImageElement;
  rect: DOMRect;
  style: CSSStyleDeclaration;
  kind: 'background' | 'subject' | 'foreground';
  opacity: number;
  filter: string;
  mirrorX: boolean;
  clip?: {
    rect: DOMRect;
    style: CSSStyleDeclaration;
  };
};

type ShapeLayer = {
  kind: 'top8-identity' | 'thumbnail-identity';
  rect: DOMRect;
  background: string;
  accent: string;
  align: 'left' | 'right';
};

type TextLayer = {
  text: string;
  rect: DOMRect;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fontWeight: string;
  letterSpacing: number;
  textAlign: string;
  textShadow: string;
  textTransform: string;
};

export async function exportGraphicAsPng(
  source: HTMLElement,
  { width, height, filename, trustedText }: ExportGraphicOptions
): Promise<void> {
  assertTrustedExportText(source, trustedText);
  await document.fonts?.ready;
  const layers = await visibleImageLayers(source);
  const shapeElements = visibleShapeElements(source);
  const shapeLayers = shapeElements.map(shapeLayer);
  const textElements = visibleTextElements(source);
  const textLayers = textElements.map(textLayer);
  // All composited layer rectangles use viewport coordinates. Snapshot the root
  // in the same layout frame so an async capture or scroll cannot offset them.
  const sourceRect = source.getBoundingClientRect();
  const originalVisibility = layers.map(({ image }) => image.style.visibility);
  const originalShapeVisibility = shapeElements.map((element) => element.style.visibility);
  const originalTextVisibility = textElements.map((element) => element.style.visibility);
  const directChildren = [...source.children].filter((element): element is HTMLElement => element instanceof HTMLElement);
  const originalChildVisibility = directChildren.map((element) => element.style.visibility);
  const originalBackground = source.style.getPropertyValue('background');
  const originalBackgroundPriority = source.style.getPropertyPriority('background');
  const originalMargin = source.style.getPropertyValue('margin');
  const originalMarginPriority = source.style.getPropertyPriority('margin');
  const originalHidePseudo = source.getAttribute('data-export-hide-pseudo');
  source.style.setProperty('margin', '0', 'important');
  layers.forEach(({ image }) => { image.style.visibility = 'hidden'; });
  shapeElements.forEach((element) => { element.style.visibility = 'hidden'; });
  textElements.forEach((element) => { element.style.visibility = 'hidden'; });
  let base: Blob | null = null;
  let contentOverlay: Blob | null = null;
  try {
    const hasBackground = layers.some(({ kind }) => kind === 'background');
    if (hasBackground) {
      directChildren.forEach((element) => { element.style.visibility = 'hidden'; });
      source.setAttribute('data-export-hide-pseudo', 'true');
      base = await captureSource(source);
      directChildren.forEach((element, index) => { element.style.visibility = originalChildVisibility[index]; });
      layers.forEach(({ image }) => { image.style.visibility = 'hidden'; });
      source.removeAttribute('data-export-hide-pseudo');
      source.style.setProperty('background', 'transparent', 'important');
      contentOverlay = await captureSource(source);
      if (!contentOverlay) throw new Error('JABS could not encode the PNG content layer.');
    } else {
      base = await captureSource(source);
    }
    if (!base) throw new Error('JABS could not encode the PNG composition.');
  } finally {
    directChildren.forEach((element, index) => { element.style.visibility = originalChildVisibility[index]; });
    if (originalBackground) {
      source.style.setProperty('background', originalBackground, originalBackgroundPriority);
    } else {
      source.style.removeProperty('background');
    }
    if (originalMargin) {
      source.style.setProperty('margin', originalMargin, originalMarginPriority);
    } else {
      source.style.removeProperty('margin');
    }
    if (originalHidePseudo === null) source.removeAttribute('data-export-hide-pseudo');
    else source.setAttribute('data-export-hide-pseudo', originalHidePseudo);
    shapeElements.forEach((element, index) => {
      element.style.visibility = originalShapeVisibility[index];
    });
    textElements.forEach((element, index) => {
      element.style.visibility = originalTextVisibility[index];
    });
    layers.forEach(({ image }, index) => { image.style.visibility = originalVisibility[index]; });
  }
  if (!base) throw new Error('JABS could not encode the PNG composition.');
  const png = await composeRasterLayers(
    sourceRect,
    base,
    contentOverlay,
    layers,
    shapeLayers,
    textLayers,
    width,
    height
  );
  downloadBlob(png, filename);
}

function assertTrustedExportText(source: HTMLElement, trustedText: readonly string[]): void {
  const compact = (value: string) => value.normalize('NFKC').replace(/\s/gu, '');
  const actual = compact(source.textContent ?? '');
  const expected = compact(trustedText.join(''));
  if (actual !== expected) {
    throw new Error('The preview text changed outside JABS controls. The graphic was not exported.');
  }
}

async function visibleImageLayers(source: HTMLElement): Promise<ImageLayer[]> {
  const images = [...source.querySelectorAll('img')].filter((image) => {
    const style = getComputedStyle(image);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && image.src;
  });
  await Promise.all(images.map(async (image) => {
    await image.decode();
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
      throw new Error('A graphic image was not ready for PNG export.');
    }
  }));
  return images.map((image) => {
    const style = getComputedStyle(image);
    const kind = image.dataset.exportImageLayer === 'background'
      ? 'background'
      : image.dataset.exportImageLayer === 'foreground' ? 'foreground' : 'subject';
    return {
      image,
      rect: image.getBoundingClientRect(),
      style,
      kind,
      opacity: finiteOpacity(style.opacity),
      filter: style.filter,
      mirrorX: image.dataset.exportMirrorX === 'true',
      clip: kind === 'background'
        ? { rect: source.getBoundingClientRect(), style: getComputedStyle(source) }
        : clippedAncestor(image)
    };
  });
}

function captureSource(source: HTMLElement): Promise<Blob | null> {
  return toBlob(source, {
    width: source.clientWidth,
    height: source.clientHeight,
    pixelRatio: 1
  });
}

function visibleShapeElements(source: HTMLElement): HTMLElement[] {
  return [...source.querySelectorAll<HTMLElement>('[data-export-shape]')].filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function shapeLayer(element: HTMLElement): ShapeLayer {
  const canvas = element.closest<HTMLElement>('.top8-canvas, .thumbnail-canvas');
  const style = getComputedStyle(canvas ?? element);
  return {
    kind: element.dataset.exportShape as ShapeLayer['kind'],
    rect: element.getBoundingClientRect(),
    background: style.getPropertyValue('--top8-background').trim()
      || style.getPropertyValue('--thumbnail-background').trim()
      || '#19110c',
    accent: style.getPropertyValue('--top8-accent').trim()
      || style.getPropertyValue('--thumbnail-accent').trim()
      || '#f7b733',
    align: element.closest('.thumbnail-player-one') ? 'left' : 'right'
  };
}

function visibleTextElements(source: HTMLElement): HTMLElement[] {
  return [...source.querySelectorAll<HTMLElement>('[data-export-text]')].filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Boolean(element.textContent?.trim());
  });
}

function textLayer(element: HTMLElement): TextLayer {
  const style = getComputedStyle(element);
  return {
    text: element.textContent?.trim() ?? '',
    rect: element.getBoundingClientRect(),
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: number(style.fontSize),
    fontStyle: style.fontStyle,
    fontWeight: style.fontWeight,
    letterSpacing: number(style.letterSpacing),
    textAlign: style.textAlign,
    textShadow: style.textShadow,
    textTransform: style.textTransform
  };
}

function clippedAncestor(image: HTMLImageElement): ImageLayer['clip'] {
  const element = image.closest<HTMLElement>('[data-export-clip]');
  return element ? { rect: element.getBoundingClientRect(), style: getComputedStyle(element) } : undefined;
}

async function composeRasterLayers(
  sourceRect: DOMRect,
  base: Blob,
  contentOverlay: Blob | null,
  layers: ImageLayer[],
  shapes: ShapeLayer[],
  text: TextLayer[],
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG export is unavailable in this webview.');
  const baseImage = await blobImage(base);
  context.drawImage(baseImage, 0, 0, width, height);
  const scaleX = width / Math.max(1, sourceRect.width);
  const scaleY = height / Math.max(1, sourceRect.height);
  for (const layer of layers.filter(({ kind }) => kind === 'background')) {
    drawImageLayer(context, layer, sourceRect, scaleX, scaleY);
  }
  if (contentOverlay) {
    const contentImage = await blobImage(contentOverlay);
    context.drawImage(contentImage, 0, 0, width, height);
  }
  for (const layer of layers.filter(({ kind }) => kind === 'subject')) {
    drawImageLayer(context, layer, sourceRect, scaleX, scaleY);
  }
  for (const layer of shapes) drawShapeLayer(context, layer, sourceRect, scaleX, scaleY);
  for (const layer of layers.filter(({ kind }) => kind === 'foreground')) {
    drawImageLayer(context, layer, sourceRect, scaleX, scaleY);
  }
  for (const layer of text) drawTextLayer(context, layer, sourceRect, scaleX, scaleY);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob
      ? resolve(blob)
      : reject(new Error('JABS could not encode the final PNG.')), 'image/png');
  });
}

function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: TextLayer,
  sourceRect: DOMRect,
  scaleX: number,
  scaleY: number
): void {
  const text = transformText(layer.text, layer.textTransform);
  const box = {
    x: (layer.rect.left - sourceRect.left) * scaleX,
    y: (layer.rect.top - sourceRect.top) * scaleY,
    width: layer.rect.width * scaleX,
    height: layer.rect.height * scaleY
  };
  if (!text || !box.width || !box.height) return;
  context.save();
  context.fillStyle = layer.color;
  context.textBaseline = 'alphabetic';
  let fontSize = layer.fontSize * scaleY;
  const letterSpacing = layer.letterSpacing * scaleX;
  context.font = canvasFont(layer, fontSize);
  const fullWidth = () => context.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
  while (fullWidth() > box.width && fontSize > layer.fontSize * scaleY * 0.58) {
    fontSize -= 1;
    context.font = canvasFont(layer, fontSize);
  }
  const width = fullWidth();
  const x = layer.textAlign === 'right' || layer.textAlign === 'end'
    ? box.x + box.width - width
    : layer.textAlign === 'center'
      ? box.x + (box.width - width) / 2
      : box.x;
  const metrics = context.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.78;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.22;
  const y = box.y + (box.height - ascent - descent) / 2 + ascent;
  applyTextShadow(context, layer.textShadow, scaleY);
  drawSpacedText(context, text, x, y, letterSpacing);
  context.restore();
}

function canvasFont(layer: TextLayer, size: number): string {
  return `${layer.fontStyle} ${layer.fontWeight} ${size}px ${layer.fontFamily}`;
}

function transformText(value: string, transform: string): string {
  if (transform === 'uppercase') return value.toLocaleUpperCase();
  if (transform === 'lowercase') return value.toLocaleLowerCase();
  if (transform === 'capitalize') return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
  return value;
}

function drawSpacedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number
): void {
  let cursor = x;
  for (const character of text) {
    context.fillText(character, cursor, y);
    cursor += context.measureText(character).width + spacing;
  }
}

function applyTextShadow(context: CanvasRenderingContext2D, value: string, scale: number): void {
  if (!value || value === 'none') return;
  const color = value.match(/rgba?\([^)]+\)|#[\da-f]{3,8}/i)?.[0];
  const sizes = [...value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
  if (color) context.shadowColor = color;
  context.shadowOffsetX = (sizes[0] ?? 0) * scale;
  context.shadowOffsetY = (sizes[1] ?? 0) * scale;
  context.shadowBlur = Math.max(0, ...(sizes.slice(2).map((size) => size * scale)));
}

function drawImageLayer(
  context: CanvasRenderingContext2D,
  layer: ImageLayer,
  sourceRect: DOMRect,
  scaleX: number,
  scaleY: number
): void {
  const { image, rect, style } = layer;
  const borderLeft = number(style.borderLeftWidth);
  const borderRight = number(style.borderRightWidth);
  const borderTop = number(style.borderTopWidth);
  const borderBottom = number(style.borderBottomWidth);
  const box = {
    x: (rect.left - sourceRect.left + borderLeft) * scaleX,
    y: (rect.top - sourceRect.top + borderTop) * scaleY,
    width: Math.max(0, (rect.width - borderLeft - borderRight) * scaleX),
    height: Math.max(0, (rect.height - borderTop - borderBottom) * scaleY)
  };
  if (!box.width || !box.height) return;
  const destination = objectFitBox(
    image.naturalWidth,
    image.naturalHeight,
    box,
    style.objectFit,
    style.objectPosition
  );
  context.save();
  const ancestorClip = imageClipBox(layer, sourceRect, scaleX, scaleY);
  if (ancestorClip) roundedClip(context, ancestorClip.box, ancestorClip.radius);
  roundedClip(context, box, number(style.borderRadius) * Math.min(scaleX, scaleY));
  context.globalAlpha = layer.opacity;
  if (layer.kind !== 'background' && layer.filter && layer.filter !== 'none') {
    context.filter = layer.filter.replace(/(-?\d+(?:\.\d+)?)px/gu, (_, value: string) => (
      `${Number(value) * Math.min(scaleX, scaleY)}px`
    ));
  }
  if (layer.mirrorX) {
    context.translate(destination.x * 2 + destination.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(image, destination.x, destination.y, destination.width, destination.height);
  const borderWidth = number(style.borderTopWidth) * Math.min(scaleX, scaleY);
  if (borderWidth > 0 && style.borderTopStyle !== 'none') {
    context.filter = 'none';
    context.strokeStyle = style.borderTopColor;
    context.lineWidth = borderWidth;
    context.stroke();
  }
  context.restore();
}

function finiteOpacity(value: string): number {
  const opacity = Number.parseFloat(value);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
}

function imageClipBox(
  layer: ImageLayer,
  sourceRect: DOMRect,
  scaleX: number,
  scaleY: number
): { box: { x: number; y: number; width: number; height: number }; radius: number } | undefined {
  if (!layer.clip) return undefined;
  const { rect, style } = layer.clip;
  return {
    box: {
      x: (rect.left - sourceRect.left) * scaleX,
      y: (rect.top - sourceRect.top) * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY
    },
    radius: number(style.borderRadius) * Math.min(scaleX, scaleY)
  };
}

function drawShapeLayer(
  context: CanvasRenderingContext2D,
  layer: ShapeLayer,
  sourceRect: DOMRect,
  scaleX: number,
  scaleY: number
): void {
  const box = {
    x: (layer.rect.left - sourceRect.left) * scaleX,
    y: (layer.rect.top - sourceRect.top) * scaleY,
    width: layer.rect.width * scaleX,
    height: layer.rect.height * scaleY
  };
  context.save();
  if (layer.kind === 'top8-identity') {
    const gradient = context.createLinearGradient(0, box.y, 0, box.y + box.height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.32, layer.background);
    gradient.addColorStop(1, layer.background);
    context.fillStyle = gradient;
    context.fillRect(box.x, box.y, box.width, box.height);
  } else {
    context.shadowColor = 'rgba(0,0,0,.34)';
    context.shadowOffsetX = 5 * scaleX;
    context.shadowOffsetY = 7 * scaleY;
    context.fillStyle = layer.background;
    context.beginPath();
    if (layer.align === 'left') {
      context.moveTo(box.x, box.y);
      context.lineTo(box.x + box.width * 0.92, box.y);
      context.lineTo(box.x + box.width, box.y + box.height);
      context.lineTo(box.x, box.y + box.height);
    } else {
      context.moveTo(box.x + box.width * 0.08, box.y);
      context.lineTo(box.x + box.width, box.y);
      context.lineTo(box.x + box.width, box.y + box.height);
      context.lineTo(box.x, box.y + box.height);
    }
    context.closePath();
    context.fill();
    context.shadowColor = 'transparent';
    context.fillStyle = layer.accent;
    const lineX = layer.align === 'left' ? box.x : box.x + box.width * 0.12;
    context.fillRect(lineX, box.y, box.width * 0.88, Math.max(2, 3.2 * scaleY));
  }
  context.restore();
}

function objectFitBox(
  naturalWidth: number,
  naturalHeight: number,
  box: { x: number; y: number; width: number; height: number },
  fit: string,
  position: string
) {
  if (fit === 'fill') return box;
  const ratio = fit === 'cover'
    ? Math.max(box.width / naturalWidth, box.height / naturalHeight)
    : Math.min(box.width / naturalWidth, box.height / naturalHeight);
  const width = naturalWidth * ratio;
  const height = naturalHeight * ratio;
  const [positionX, positionY] = objectPosition(position);
  return {
    x: box.x + (box.width - width) * positionX,
    y: box.y + (box.height - height) * positionY,
    width,
    height
  };
}

function objectPosition(value: string): [number, number] {
  const parts = value.trim().split(/\s+/);
  return [positionPart(parts[0], 'x'), positionPart(parts[1] ?? '50%', 'y')];
}

function positionPart(value: string, axis: 'x' | 'y'): number {
  if (value.endsWith('%')) return Math.min(1, Math.max(0, Number.parseFloat(value) / 100));
  if (value === 'left' || value === 'top') return 0;
  if (value === 'right' || value === 'bottom') return 1;
  if (value === 'center') return 0.5;
  return axis === 'x' ? 0.5 : 0.5;
}

function roundedClip(
  context: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  radius: number
): void {
  const bounded = Math.min(radius, box.width / 2, box.height / 2);
  context.beginPath();
  context.moveTo(box.x + bounded, box.y);
  context.lineTo(box.x + box.width - bounded, box.y);
  context.quadraticCurveTo(box.x + box.width, box.y, box.x + box.width, box.y + bounded);
  context.lineTo(box.x + box.width, box.y + box.height - bounded);
  context.quadraticCurveTo(
    box.x + box.width,
    box.y + box.height,
    box.x + box.width - bounded,
    box.y + box.height
  );
  context.lineTo(box.x + bounded, box.y + box.height);
  context.quadraticCurveTo(box.x, box.y + box.height, box.x, box.y + box.height - bounded);
  context.lineTo(box.x, box.y + bounded);
  context.quadraticCurveTo(box.x, box.y, box.x + bounded, box.y);
  context.closePath();
  context.clip();
}

function number(value: string): number {
  return Number.parseFloat(value) || 0;
}

async function blobImage(blob: Blob): Promise<HTMLImageElement> {
  const src = await blobDataUrl(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('JABS could not render the base PNG composition.'));
    image.src = src;
  });
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('JABS could not prepare the base PNG composition.'));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function safeGraphicFilename(value: string, suffix: string): string {
  const stem = value.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${stem || 'jabs'}-${suffix}.png`;
}
