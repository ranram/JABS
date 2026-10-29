// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { createTestOverlayState } from '@shared/testFixtures';
import {
  customScoreboardSchema,
  customScoreboardRegion,
  customScoreboardRegionIds,
  withCustomScoreboardRegion,
  mirrorCustomScoreboardRegion,
  type CustomScoreboard,
  type CustomScoreboardRegionId,
  type CustomScoreboardRegion
} from '@shared/customScoreboards';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { CustomScoreboardCanvas } from '../CustomScoreboardCanvas';
import { CustomScoreboardBroadcastExtras } from '../operator/CustomScoreboardBroadcastExtras';
import { CustomScoreboardRegionControls } from './CustomScoreboardRegionControls';

vi.mock('../../hooks/useScoreboardPhotos', () => ({ useScoreboardPhotos: () => ({ state: { enabled: false } }) }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeAll(initializeI18n);

it('combines sponsor and player names and migrates legacy colors to shared typography', async () => {
  const editor = await mountEditor();
  const names = editor.view.container.querySelectorAll('.custom-scoreboard-identity');
  expect([...names].map((name) => name.textContent)).toEqual(['Team | One', 'Two | Other']);
  expect(editor.view.container.querySelector('[data-custom-scoreboard-region$=Sponsor]')).toBeNull();
  expect(customScoreboardRegionIds.some((id) => /sponsor/i.test(id))).toBe(false);
  const saved = JSON.parse(JSON.stringify(editor.scoreboard));
  saved.playerElements.playerOne.name.color = '#cc8844';
  saved.playerElements.playerTwo.name.sponsorColor = '#4477cc';
  saved.regions.matchLabel.color = '#77cc88';
  saved.typography.textColor = '#ffaa33';
  saved.typography.sponsorColor = '#33aaff';
  editor.scoreboard = customScoreboardSchema.parse(saved);
  await editor.view.rerender();
  expect(editor.canvas.style.getPropertyValue('--custom-text')).toBe('#ffaa33');
  expect(editor.canvas.style.getPropertyValue('--custom-sponsor')).toBe('#33aaff');
  for (const id of customScoreboardRegionIds) {
    expect(customScoreboardRegion(editor.scoreboard, id)).not.toHaveProperty('color');
    expect(customScoreboardRegion(editor.scoreboard, id)).not.toHaveProperty('sponsorColor');
  }
  for (const element of editor.view.container.querySelectorAll<HTMLElement>('[data-custom-scoreboard-region]')) {
    expect(element.style.color).toBe('');
    expect(element.style.getPropertyValue('--custom-region-sponsor')).toBe('');
  }
  editor.scoreboard = { ...editor.scoreboard, visibility: { ...editor.scoreboard.visibility, sponsors: false } };
  await editor.view.rerender();
  expect(
    [...editor.view.container.querySelectorAll('.custom-scoreboard-identity')].map((name) => name.textContent)
  ).toEqual(['One', 'Two']);
});

it('selects visible flag pixels and locks pointer or keyboard moves to the active field', async () => {
  const editor = await mountEditor();
  const legacySponsor = { ...editor.scoreboard.playerElements.playerOne.sponsor };
  await editor.pointer('pointerdown', 150, 75); // Transparent flag pixels let the name underneath be selected.
  expect(editor.selected).toBe('playerOneName');
  expect(editor.captures.has(1)).toBe(true);
  await editor.pointer('pointerdown', 850, 75, false, 2); // A second pointer cannot change the active drag.
  expect(editor.selected).toBe('playerOneName');
  await editor.pointer('pointermove', 170, 85);
  await editor.pointer('pointerup', 170, 85);
  expect(editor.scoreboard.playerElements.playerOne.name).toMatchObject({ x: 120, y: 50 });
  expect(editor.scoreboard.playerElements.playerOne.flag).toEqual(editor.region);
  expect(editor.scoreboard.playerElements.playerOne.sponsor).toEqual(legacySponsor);
  expect(editor.readback).toHaveBeenCalledOnce();
  await editor.pointer('pointerdown', 250, 75, true); // Alt reaches the flag behind the selected name.
  expect(editor.selected).toBe('playerOneFlag');
  await editor.pointer('pointercancel', 250, 75);
  await editor.pointer('pointerdown', 250, 75, true); // Repeating Alt reaches the name again.
  expect(editor.selected).toBe('playerOneName');
  await editor.pointer('lostpointercapture', 250, 75);
  await act(async () =>
    editor.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))
  );
  expect(editor.scoreboard.playerElements.playerOne.name.x).toBe(130);
  await editor.view.rerender();
  await editor.pointer('pointerdown', 250, 75);
  await editor.pointer('pointermove', 9000, 5000);
  await editor.pointer('pointerup', 9000, 5000);
  expect(editor.scoreboard.playerElements.playerOne.name).toMatchObject({ x: 760, y: 170 });
  expect(editor.captures.size).toBe(0);
  expect(editor.readback).toHaveBeenCalledOnce();
});

it('grabs small text accurately at reduced preview sizes without saving hand jitter', async () => {
  const editor = await mountEditor();
  editor.selectedSet.setId = 'tournament-set';
  editor.selectedSet.playerOne.seed = 3;
  editor.scoreboard = withCustomScoreboardRegion(editor.scoreboard, 'playerOneName', {
    x: 100,
    y: 40,
    width: 600,
    height: 80,
    align: 'left'
  });
  editor.scoreboard = withCustomScoreboardRegion(editor.scoreboard, 'playerOnePronouns', {
    x: 400,
    y: 90,
    width: 200,
    height: 20,
    align: 'left'
  });
  editor.scoreboard = withCustomScoreboardRegion(editor.scoreboard, 'playerOneSeed', {
    x: 440,
    y: 90,
    width: 100,
    height: 20,
    align: 'left'
  });
  editor.scoreboard = {
    ...editor.scoreboard,
    visibility: { ...editor.scoreboard.visibility, pronouns: true, seeds: true }
  };
  editor.textRects.set('playerOneName', [new DOMRect(100, 40, 160, 36)]);
  editor.textRects.set('playerOnePronouns', [new DOMRect(400, 90, 36, 20)]);
  editor.textRects.set('playerOneSeed', [new DOMRect(470, 90, 30, 20)]);
  editor.previewScale = 0.5;
  await editor.view.rerender();
  const smallFields = editor.scoreboard;
  editor.textRects.get('playerOneName')!.push(new DOMRect(436, 90, 12, 20));
  await editor.pointer('pointerdown', 220, 52); // An exact hit beats a nearby field's grab margin.
  expect(editor.selected).toBe('playerOneName');
  await editor.pointer('pointerup', 220, 52);
  editor.textRects.get('playerOneName')![1] = new DOMRect(380, 90, 200, 20);
  await editor.pointer('pointerdown', 210, 50); // Small text also wins when the text runs themselves overlap.
  expect(editor.selected).toBe('playerOnePronouns');
  await editor.pointer('pointerup', 210, 50);
  editor.textRects.get('playerOneName')!.pop();
  await editor.pointer('pointerdown', 220, 52);
  expect(editor.selected).toBe('playerOnePronouns');
  await editor.pointer('pointermove', 221, 53);
  await editor.pointer('pointerup', 221, 53);
  expect(editor.scoreboard).toBe(smallFields); // Selecting with hand jitter never saves a move.
  await editor.pointer('pointerdown', 220, 52);
  await editor.pointer('pointermove', 230, 62);
  expect(editor.canvas.classList.contains('is-dragging')).toBe(true);
  await editor.pointer('pointerup', 230, 62);
  expect(editor.scoreboard.playerElements.playerOne.pronouns).toMatchObject({ x: 420, y: 110 });
  expect(editor.scoreboard.playerElements.playerOne.name).toEqual(smallFields.playerElements.playerOne.name);
  expect(editor.scoreboard.playerElements.playerOne.seed).toEqual(smallFields.playerElements.playerOne.seed);
  expect(editor.selected).toBe('playerOnePronouns');
  await editor.pointer('pointerdown', 240, 50);
  expect(editor.selected).toBe('playerOneSeed');
  const beforeKey = editor.scoreboard;
  await act(async () =>
    editor.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(editor.scoreboard).toBe(beforeKey); // Keyboard nudges cannot compete with a captured drag.
  await editor.pointer('pointerup', 240, 50);
  editor.textRects.set('playerOneSeed', [new DOMRect(470, 50, 30, 20)]);
  await editor.pointer('pointerdown', 240, 30); // Text clipped outside its saved field is not a target.
  expect(editor.captures.size).toBe(0);
  await editor.pointer('pointerdown', 180, 30); // Empty space in the unselected name box is not a target.
  expect(editor.selected).toBe('playerOneSeed');
  expect(editor.captures.size).toBe(0);
  expect(editor.scoreboard).toBe(beforeKey);
});

it('enables individual rails locally and preserves their visibility when saved', async () => {
  const editor = await mountEditor();
  // Older layouts keep all rails; enabling one from a disabled group must not enable the others.
  const legacy = JSON.parse(JSON.stringify(editor.scoreboard));
  delete legacy.visibility.infoLeft;
  delete legacy.visibility.infoCenter;
  delete legacy.visibility.infoRight;
  editor.scoreboard = customScoreboardSchema.parse(legacy);
  expect(editor.scoreboard.visibility).toMatchObject({ infoLeft: true, infoCenter: true, infoRight: true });
  editor.selectedSet.broadcast = { infoBarEnabled: false, logoEnabled: false, infoLeft: 'Bracket link' };
  const changeBroadcast = vi.fn((patch: Partial<NonNullable<typeof editor.selectedSet.broadcast>>) => {
    editor.selectedSet.broadcast = { ...editor.selectedSet.broadcast!, ...patch };
  });
  const extras = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(CustomScoreboardBroadcastExtras, {
        scoreboard: editor.scoreboard,
        broadcast: editor.selectedSet.broadcast,
        onChange: (next) => {
          editor.scoreboard = next;
        },
        onBroadcastChange: changeBroadcast
      })
    )
  );
  // The broadcast switch is available here even when the stream editor has rails turned off.
  const master = extras.container.querySelector<HTMLInputElement>('[data-testid=custom-info-bar-enabled]')!;
  expect(master.checked).toBe(false);
  await act(async () => master.click());
  expect(changeBroadcast).toHaveBeenLastCalledWith({ infoBarEnabled: true });
  expect(editor.scoreboard.visibility.bottomRails).toBe(true);
  await extras.rerender();
  expect(master.checked).toBe(true);
  await act(async () => master.click());
  expect(changeBroadcast).toHaveBeenLastCalledWith({ infoBarEnabled: false });
  editor.scoreboard = { ...editor.scoreboard, visibility: { ...editor.scoreboard.visibility, bottomRails: false } };
  await extras.rerender();
  const leftRail = [...extras.container.querySelectorAll<HTMLLabelElement>('.mantine-Checkbox-label')].find(
    (node) => node.textContent === 'Left rail'
  )!;
  await act(async () => leftRail.click());
  expect(editor.scoreboard.visibility).toMatchObject({
    bottomRails: true,
    infoLeft: true,
    infoCenter: false,
    infoRight: false
  });
  expect(changeBroadcast).toHaveBeenCalledWith({ infoBarEnabled: true });
  const savedRails = customScoreboardSchema.parse(JSON.parse(JSON.stringify(editor.scoreboard)));
  await editor.view.rerender(() =>
    h(CustomScoreboardCanvas, { scoreboard: savedRails, frameUrl: 'frame.png', selectedSet: editor.selectedSet })
  );
  expect(editor.view.container.querySelector('[data-custom-scoreboard-region=infoLeft]')).not.toBeNull();
  expect(editor.view.container.querySelector('[data-custom-scoreboard-region=infoLeft]')?.textContent).toBe(
    'Bracket link'
  );
  expect(editor.view.container.querySelector('[data-custom-scoreboard-region=infoCenter]')).toBeNull();
  expect(editor.view.container.querySelector('[data-custom-scoreboard-region=infoRight]')).toBeNull();
});

it('mirrors only the opposite player field in either direction', async () => {
  const editor = await mountEditor();
  let mirrorRegion: CustomScoreboardRegionId = 'playerOneName';
  const controls = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(CustomScoreboardRegionControls, {
        regionId: mirrorRegion,
        region: customScoreboardRegion(editor.scoreboard, mirrorRegion),
        onChange() {},
        onMirror() {
          editor.scoreboard = mirrorCustomScoreboardRegion(editor.scoreboard, mirrorRegion);
        }
      })
    )
  );
  const pairs = [
    ['playerOneFlag', 'playerTwoFlag'],
    ['playerOneName', 'playerTwoName'],
    ['playerOneXHandle', 'playerTwoXHandle'],
    ['playerOnePronouns', 'playerTwoPronouns'],
    ['playerOneSeed', 'playerTwoSeed'],
    ['playerOneScore', 'playerTwoScore']
  ] as const;
  for (const [left, right] of pairs) {
    for (const [sourceId, targetId, align] of [
      [left, right, 'left'],
      [right, left, 'right'],
      [left, right, 'center']
    ] as const) {
      mirrorRegion = sourceId;
      const source = { x: sourceId === left ? 116 : 1284, y: 76, width: 520, height: 46, align };
      editor.scoreboard = withCustomScoreboardRegion(editor.scoreboard, sourceId, source);
      const before = editor.scoreboard;
      await controls.rerender();
      const button = controls.container.querySelector<HTMLButtonElement>('button.mantine-Button-root')!;
      expect(button.textContent).toBe(`Mirror to Player ${targetId === right ? 2 : 1}`);
      await act(async () => button.click());
      editor.scoreboard = customScoreboardSchema.parse(JSON.parse(JSON.stringify(editor.scoreboard)));
      const mirrored: CustomScoreboardRegion = {
        ...source,
        x: sourceId === left ? 1284 : 116,
        align: align === 'left' ? 'right' : align === 'right' ? 'left' : 'center'
      };
      expect(editor.scoreboard).toEqual(withCustomScoreboardRegion(before, targetId, mirrored));
    }
  }
  for (const id of ['matchLabel', 'logo', 'infoLeft', 'infoCenter', 'infoRight'] as const) {
    mirrorRegion = id;
    await controls.rerender();
    expect(controls.container.querySelector('button.mantine-Button-root')).toBeNull();
  }
  await controls.unmount();
});

it('fits long mixed-script names after font, size, and region changes', async () => {
  const editor = await mountEditor();
  // Model glyph bounds inside the saved regions, including padding for overhangs.
  // The DOM simulator has no font layout engine, so resize events use logical sizes.
  const resizes = new Map<Element, () => void>();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: () => void) {}
      observe(element: Element) {
        resizes.set(element, this.callback);
      }
      disconnect() {
        for (const [element, callback] of resizes) if (callback === this.callback) resizes.delete(element);
      }
    }
  );
  const boundsFor = (element: HTMLElement) =>
    customScoreboardRegion(
      editor.scoreboard,
      element.closest<HTMLElement>('[data-custom-scoreboard-region]')!.dataset
        .customScoreboardRegion as CustomScoreboardRegionId
    );
  const fontSize = (row: HTMLElement) => Number.parseFloat(row.style.fontSize) || editor.scoreboard.typography.nameSize;
  const originalStyle = getComputedStyle;
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => {
    const style = originalStyle(element);
    if (!element.classList.contains('custom-scoreboard-name-fit')) return style;
    return new Proxy(style, {
      get(target, key) {
        return key === 'fontSize' ? `${fontSize(element as HTMLElement)}px` : Reflect.get(target, key, target);
      }
    });
  });
  for (const [metric, dimension] of [
    ['clientWidth', 'width'],
    ['clientHeight', 'height']
  ] as const) {
    vi.spyOn(HTMLElement.prototype, metric, 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('custom-scoreboard-name-fit') ? boundsFor(this)[dimension] : 0;
    });
  }
  for (const metric of ['scrollWidth', 'offsetWidth', 'scrollHeight', 'offsetHeight'] as const) {
    vi.spyOn(HTMLElement.prototype, metric, 'get').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('custom-scoreboard-identity')) return 0;
      const size = fontSize(this.parentElement!);
      const fontWidth = editor.scoreboard.typography.font === 'bungee-shade' ? 1.8 : 1;
      return Math.ceil(
        metric.endsWith('Width') ? ((this.textContent?.length ?? 0) * 0.6 * fontWidth + 0.24) * size : size * 1.4
      );
    });
  }
  editor.scoreboard.visibility.sponsors = true;
  editor.scoreboard.typography.nameSize = 96;
  editor.selectedSet.playerOne.name = 'Player One with a very long tag';
  editor.selectedSet.playerTwo.name = 'あいう/ABC with another long player tag';
  await editor.view.rerender(() =>
    h(CustomScoreboardCanvas, { scoreboard: editor.scoreboard, frameUrl: 'frame.png', selectedSet: editor.selectedSet })
  );
  const rows = [...editor.view.container.querySelectorAll<HTMLElement>('.custom-scoreboard-name-fit')];
  function expectNamesToFit() {
    for (const row of rows) {
      const identity = row.firstElementChild as HTMLElement;
      expect(identity.scrollWidth).toBeLessThanOrEqual(boundsFor(row).width);
      expect(identity.scrollHeight).toBeLessThanOrEqual(boundsFor(row).height);
    }
  }
  expectNamesToFit();
  expect(rows.every((row) => fontSize(row) < 96)).toBe(true);
  const names = [editor.selectedSet.playerOne.name, editor.selectedSet.playerTwo.name];
  editor.selectedSet.round = 'Grand Final';
  editor.selectedSet.winnersSideEntrantId = editor.selectedSet.playerOne.entrantId;
  await editor.view.rerender();
  expect(
    editor.view.container.querySelector('[data-custom-scoreboard-region=playerTwoName] .custom-scoreboard-name-text')
      ?.textContent
  ).toBe(`[L] ${names[1]}`);
  expectNamesToFit();
  editor.selectedSet.winnersSideEntrantId = editor.selectedSet.playerTwo.entrantId;
  await editor.view.rerender();
  expect(
    editor.view.container.querySelector('[data-custom-scoreboard-region=playerOneName] .custom-scoreboard-name-text')
      ?.textContent
  ).toBe(`${names[0]} [L]`);
  expectNamesToFit();
  editor.selectedSet.round = 'Grand Final Reset';
  await editor.view.rerender();
  expect(
    [...editor.view.container.querySelectorAll('.custom-scoreboard-name-text')].map((node) => node.textContent)
  ).toEqual(names);
  expect([editor.selectedSet.playerOne.name, editor.selectedSet.playerTwo.name]).toEqual(names);
  for (const font of ['bebas-neue', 'bungee-shade'] as const) {
    editor.scoreboard.typography.font = font;
    editor.scoreboard = customScoreboardSchema.parse(JSON.parse(JSON.stringify(editor.scoreboard)));
    await editor.view.rerender(() =>
      h(CustomScoreboardCanvas, {
        scoreboard: editor.scoreboard,
        frameUrl: 'frame.png',
        selectedSet: editor.selectedSet
      })
    );
    expectNamesToFit();
  }
  expect(
    customScoreboardSchema.safeParse({
      ...editor.scoreboard,
      typography: { ...editor.scoreboard.typography, font: 'system-ui' }
    }).success
  ).toBe(false);
  editor.scoreboard.typography.nameSize = 20;
  editor.scoreboard.typography.font = 'bebas-neue';
  editor.selectedSet.playerOne.name = 'I';
  editor.selectedSet.playerTwo.name = 'M';
  await editor.view.rerender();
  expectNamesToFit();
  expect(rows.map((row) => row.style.fontSize)).toEqual(['', '']);
  editor.scoreboard = withCustomScoreboardRegion(editor.scoreboard, 'playerTwoName', {
    ...customScoreboardRegion(editor.scoreboard, 'playerTwoName'),
    width: 30,
    height: 20
  });
  await editor.view.rerender();
  await act(async () => resizes.get(rows[1])!());
  expectNamesToFit();
  expect(fontSize(rows[1])).toBeLessThan(20);
});

function createLayout(): CustomScoreboard {
  const region = { x: 100, y: 40, width: 200, height: 80, align: 'left' as const };
  const fields = {
    flag: region,
    sponsor: { ...region, y: 150 },
    name: region,
    pronouns: region,
    seed: region,
    score: { ...region, x: 500 }
  };
  return {
    version: 1,
    id: 'custom',
    name: 'Custom',
    frameRevision: '1',
    regions: {
      playerOne: region,
      playerTwo: region,
      matchLabel: { ...region, x: 800 },
      logo: region,
      infoLeft: region,
      infoCenter: region,
      infoRight: region
    },
    playerElements: {
      playerOne: fields,
      playerTwo: {
        ...fields,
        flag: { ...region, x: 1700 },
        name: { ...region, x: 1400 },
        score: { ...region, x: 1300 }
      }
    },
    visibility: {
      flags: true,
      sponsors: true,
      xHandles: false,
      pronouns: false,
      seeds: false,
      round: true,
      tournamentLogo: false,
      infoLeft: true,
      infoCenter: true,
      infoRight: true,
      bottomRails: false
    },
    typography: { textColor: '#ffffff', outline: 'none', nameSize: 30, metaSize: 20, scoreSize: 40, contextSize: 20 }
  };
}

async function mountEditor() {
  const region = { x: 100, y: 40, width: 200, height: 80, align: 'left' as const };
  let scoreboard = createLayout();
  const selectedSet = createTestOverlayState().selectedSet;
  selectedSet.playerOne = { ...selectedSet.playerOne, name: 'One', prefix: 'Team', sponsor: 'Team' };
  selectedSet.playerTwo = { ...selectedSet.playerTwo, name: 'Two', sponsor: 'Other' };
  let selected: CustomScoreboardRegionId = 'playerOneFlag';
  const readback = vi.fn();
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(2);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(2);
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage() {},
    getImageData() {
      readback();
      return { data: new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255]) };
    }
  } as unknown as CanvasRenderingContext2D);
  let previewScale = 1;
  const textRects = new Map<string, DOMRect[]>();
  const scaleRect = (box: DOMRect) =>
    new DOMRect(box.x * previewScale, box.y * previewScale, box.width * previewScale, box.height * previewScale);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('custom-scoreboard-canvas')) return scaleRect(new DOMRect(0, 0, 1920, 1080));
    const id = this.dataset.customScoreboardRegion ?? this.parentElement?.dataset.customScoreboardRegion;
    if (!id) return new DOMRect();
    const box = customScoreboardRegion(scoreboard, id as CustomScoreboardRegionId);
    return scaleRect(new DOMRect(box.x, box.y, box.width, box.height));
  });
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    const field = this.startContainer.parentElement?.closest<HTMLElement>('[data-custom-scoreboard-region]');
    const rects = field && textRects.get(field.dataset.customScoreboardRegion!);
    return (rects ? rects.map(scaleRect) : field ? [field.getBoundingClientRect()] : []) as unknown as DOMRectList;
  });
  const captures = new Set<number>();
  vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation((id) => {
    captures.add(id);
  });
  vi.spyOn(Element.prototype, 'hasPointerCapture').mockImplementation((id) => captures.has(id));
  vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation((id) => {
    captures.delete(id);
  });
  const view = await mountView(() =>
    h(CustomScoreboardCanvas, {
      scoreboard,
      frameUrl: 'frame.png',
      selectedSet,
      editingRegion: selected,
      onSelectRegion: (id) => {
        selected = id;
      },
      onMoveRegion: (id, x, y) => {
        scoreboard = withCustomScoreboardRegion(scoreboard, id, { ...customScoreboardRegion(scoreboard, id), x, y });
      }
    })
  );
  const style = document.createElement('style');
  style.textContent =
    '.custom-scoreboard-region { z-index: 2; } .custom-scoreboard-region.is-editing { z-index: 3; } .custom-scoreboard-element img { object-fit: fill; }';
  view.container.append(style);
  const canvas = view.container.querySelector<HTMLElement>('.custom-scoreboard-canvas')!;
  async function pointer(type: string, x: number, y: number, altKey = false, pointerId = 1) {
    await act(async () =>
      canvas.dispatchEvent(
        new PointerEvent(type, { bubbles: true, button: 0, pointerId, clientX: x, clientY: y, altKey })
      )
    );
    await view.rerender();
  }
  return {
    view,
    canvas,
    pointer,
    readback,
    captures,
    textRects,
    selectedSet,
    region,
    get scoreboard() {
      return scoreboard;
    },
    set scoreboard(value: CustomScoreboard) {
      scoreboard = value;
    },
    get selected() {
      return selected;
    },
    set selected(value: CustomScoreboardRegionId) {
      selected = value;
    },
    get previewScale() {
      return previewScale;
    },
    set previewScale(value: number) {
      previewScale = value;
    }
  };
}

it.each(['id', 'frameRevision'] as const)(
  'cancels a captured region drag when the scoreboard %s changes',
  async (field) => {
    const editor = await mountEditor();
    await editor.pointer('pointerdown', 150, 75);
    editor.scoreboard = { ...editor.scoreboard, [field]: 'replacement' };
    await editor.view.rerender();
    const replacement = editor.scoreboard;
    await editor.pointer('pointermove', 250, 175);
    await editor.pointer('pointerup', 250, 175);
    expect(editor.scoreboard).toBe(replacement);
    expect(editor.captures.size).toBe(0);
  }
);

it.each(['blur', 'resize'])('ends region editing on window %s and preserves the last saved position', async (event) => {
  const editor = await mountEditor();
  await editor.pointer('pointerdown', 150, 75);
  await editor.pointer('pointermove', 170, 85);
  const position = editor.scoreboard;
  await act(async () => window.dispatchEvent(new Event(event)));
  await editor.pointer('pointermove', 270, 185);
  await editor.pointer('pointerup', 270, 185);
  expect(editor.scoreboard).toBe(position);
  expect(editor.captures.size).toBe(0);
});
