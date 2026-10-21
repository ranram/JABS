import { imageContainsPixel, pickVisualLayer } from '../combinedMedia/imageHitTest';

type Hit = { element: HTMLElement; box: DOMRect; distance: number; area: number };

function contains(box: DOMRect, x: number, y: number): boolean {
  return box.width > 0 && box.height > 0 && x >= box.left && x < box.right && y >= box.top && y < box.bottom;
}

function textHit(element: HTMLElement, box: DOMRect, x: number, y: number): Pick<Hit, 'distance' | 'area'> {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let distance = Infinity;
  let area = Infinity;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      // Ignore text that extends outside its field; only the visible part can be dragged.
      const left = Math.max(rect.left, box.left);
      const top = Math.max(rect.top, box.top);
      const right = Math.min(rect.right, box.right);
      const bottom = Math.min(rect.bottom, box.bottom);
      if (right <= left || bottom <= top) continue;
      const nextDistance = Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom));
      const nextArea = (right - left) * (bottom - top);
      if (nextDistance < distance || (nextDistance === distance && nextArea < area)) {
        distance = nextDistance;
        area = nextArea;
      }
    }
  }
  return { distance, area };
}

/** Measure text at its displayed size so small fields remain easy to select in the preview. */
export function pickCustomScoreboardRegion(
  regions: HTMLElement[],
  x: number,
  y: number,
  behind: boolean,
  current?: HTMLElement
): HTMLElement | undefined {
  const hits: Hit[] = regions.map((element) => {
    const box = element.getBoundingClientRect();
    const image = element.querySelector('img');
    return {
      element,
      box,
      ...(image
        ? {
            distance: contains(box, x, y) && imageContainsPixel(image, x, y) ? 0 : Infinity,
            area: box.width * box.height
          }
        : textHit(element, box, x, y))
    };
  });
  if (behind) {
    return pickVisualLayer(
      hits,
      (hit) => hit.distance === 0,
      (hit) => contains(hit.box, x, y) || hit.distance <= 6,
      true,
      hits.find((hit) => hit.element === current)
    )?.element;
  }
  // Prefer text under the pointer. If text overlaps, choose the smaller piece.
  const visible = hits.filter((hit) => hit.distance <= 6).sort((a, b) => a.distance - b.distance || a.area - b.area);
  return visible[0]?.element ?? hits.find((hit) => hit.element === current && contains(hit.box, x, y))?.element;
}
