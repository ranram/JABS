// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountHook } from '../../hooks/hookTestHarness';
import { initializeI18n, i18n } from '../../i18n';
import { HelpMenu } from './HelpMenu';
import { runTutorial, type TutorialPopover } from './runTutorial';
import { isTutorialActive } from './tutorialActivity';

let stop: (() => void) | undefined;
const fixtures: HTMLElement[] = [];
beforeEach(async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  const style = document.createElement('style');
  style.textContent = readFileSync('src/renderer/src/ui/tutorials/tutorials.css', 'utf8');
  document.head.append(style);
  fixtures.push(style);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    new DOMRect(100, 100, 400, 200)
  ] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});
afterEach(async () => {
  window.localStorage.removeItem('jabs.quick-start.dismissed');
  await act(async () => stop?.());
  stop = undefined;
  fixtures.splice(0).forEach((element) => element.remove());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(html: string) {
  const element = document.createElement('section');
  element.innerHTML = html;
  document.body.append(element);
  fixtures.push(element);
  return element;
}
function button(label: string, root: ParentNode = document) {
  const result = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => (element.querySelector('.mantine-Button-label') ?? element).textContent === label
  );
  expect(result, label).toBeDefined();
  return result!;
}

it('advances Help guides with a real Next click without touching token fields', async () => {
  const fields = fixture(`
    <div class="workspace-sticky-header"></div>
    <div data-tutorial="api-access"><input type="password" value="not-a-real-token"></div>
    <div class="tournament-lookup-row"></div><div class="startgg-panel"></div>
    <div data-tutorial="bracket-options"></div><div data-tutorial="obs"></div>
    <button data-tutorial="players">Players</button>
    <div data-tutorial="assets"><button data-tutorial="reload-assets">Reload assets</button></div>
  `);
  const secret = fields.querySelector('input')!;
  const change = vi.fn();
  secret.addEventListener('input', change);
  const navigate = vi.fn();
  const help = () => h(MantineProvider, { env: 'test' }, h(HelpMenu, { navigate }));
  const mountHelp = () => mountHook(help, true, (view) => view);
  window.localStorage.removeItem('jabs.quick-start.dismissed');
  let view = await mountHelp();
  expect(document.querySelector('.jabs-tutorial .driver-popover-title')?.textContent).toBe('Welcome to JABS!');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close guide"]')!.click());
  expect(window.localStorage.getItem('jabs.quick-start.dismissed')).toBe('true');
  await view.unmount();
  view = await mountHelp();
  expect(isTutorialActive()).toBe(false);
  navigate.mockClear();
  await act(async () => button('Help', view.container).click());
  const guides = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .map((item) => item.textContent);
  expect(guides.slice(1, 6)).toEqual([
    'Quick Start', 'Connect a start.gg token', 'Run a tournament', 'Run an exhibition', 'Use the Player Library'
  ]);
  await act(async () => {
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === 'Connect a start.gg token')!
      .click();
  });
  expect(document.querySelector('.jabs-tutorial .driver-popover-title')?.textContent).toBe('When you need a token');
  expect(getComputedStyle(document.querySelector('.driver-overlay')!).display).toBe('none');
  await act(async () => button('Next').click());
  expect(document.querySelector('.jabs-tutorial a')?.getAttribute('href')).toBe(
    'https://developer.start.gg/docs/authentication/'
  );
  await act(async () => button('Back').click());
  expect(document.querySelector('.jabs-tutorial a')).toBeNull();
  for (let step = 0; step < 3; step++) await act(async () => button('Next').click());
  await act(async () => button('Done').click());
  expect(document.querySelector('.jabs-tutorial')).toBeNull();
  expect(secret.value).toBe('not-a-real-token');
  expect(change).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => button('Help', view.container).click());
  await act(async () => {
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === 'Quick Start')!.click();
  });
  const titles = [
    'Welcome to JABS!', 'When you need a token', 'Organize a tournament stream',
    'Or run an exhibition', 'Add your media assets', 'Prepare the match and keep score', 'Send results to start.gg',
    'Connect OBS', 'Reuse player details', 'Ready when you are'
  ];
  for (const [index, title] of titles.entries()) {
    expect(document.querySelector('.jabs-tutorial .driver-popover-title')?.textContent).toBe(title);
    expect(document.querySelector('.jabs-tutorial')?.textContent).not.toContain(i18n.t('operator:help.missing'));
    await act(async () => button(index === titles.length - 1 ? 'Done' : 'Next').click());
  }
  expect(document.querySelector('.jabs-tutorial')).toBeNull();
  expect(secret.value).toBe('not-a-real-token');
  expect(change).not.toHaveBeenCalled();
  const openFolder = vi.fn();
  fields.querySelector('[data-tutorial="assets"]')!.addEventListener('click', openFolder);
  await act(async () => button('Help', view.container).click());
  await act(async () => {
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === 'Media assets and folders')!.click();
  });
  for (let step = 0; step < 5; step++) {
    expect(document.querySelector('.jabs-tutorial')?.textContent).not.toContain(i18n.t('operator:help.missing'));
    await act(async () => button(step === 4 ? 'Done' : 'Next').click());
  }
  expect(openFolder).not.toHaveBeenCalled();
  await view.unmount();
});

it('waits for navigation targets, explains unavailable steps, and cancels pending work when closed', async () => {
  vi.useFakeTimers();
  const content = fixture('<div class="tournament-lookup-row"></div>');
  let popover: TutorialPopover | undefined;
  const navigate = vi.fn();
  stop = runTutorial({
    id: 'tournament',
    t: i18n.getFixedT('en', 'operator'),
    navigate,
    render: (next) => {
      popover = next;
    }
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(navigate).toHaveBeenCalledWith('bracket');
  expect(popover?.index).toBe(0);
  popover!.next();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(popover?.index).toBe(0);
  content.innerHTML += '<select data-tutorial="event"><option>Singles</option></select>';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(popover?.index).toBe(1);
  expect(popover?.missing).toBe(false);
  popover!.next();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1800);
  });
  expect(popover?.index).toBe(2);
  expect(popover?.missing).toBe(true);
  popover!.next();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  content.innerHTML += '<div class="editor-panel"></div>';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(popover).toBeUndefined();
  expect(isTutorialActive()).toBe(false);
  expect(document.querySelector('.driver-popover')).toBeNull();
});

it('opens the player library without creating identities and escapes guide text before handing it to Driver', async () => {
  const content = fixture('<button data-tutorial="players">Players</button>');
  const opened = vi.fn(() => {
    const library = document.createElement('div');
    library.className = 'player-library-panel';
    library.innerHTML =
      '<div class="player-library-toolbar"><button>Add player</button></div><div class="player-library-list"></div><div class="player-library-workspace"></div>';
    content.append(library);
  });
  content.querySelector('button')!.addEventListener('click', opened);
  const create = vi.fn();
  content.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).textContent === 'Add player') create();
  });
  let popover: TutorialPopover | undefined;
  const t = i18n.getFixedT('en', 'operator');
  i18n.addResource('en', 'operator', 'help.steps.library.title', '<img src=x onerror="alert(1)">Library');
  try {
    stop = runTutorial({
      id: 'library',
      t,
      navigate: vi.fn(),
      render: (next) => {
        popover = next;
      }
    });
    await act(async () => {});
    expect(document.querySelector('.driver-popover-title img')).toBeNull();
    expect(document.querySelector('.driver-popover-title')?.textContent).toContain('<img');
    expect(opened).not.toHaveBeenCalled();
    popover!.next();
    await act(async () => {});
    expect(opened).toHaveBeenCalledOnce();
    for (let index = 0; index < 3; index++) {
      popover!.next();
      await act(async () => {});
    }
    expect(create).not.toHaveBeenCalled();
    expect(opened).toHaveBeenCalledOnce();
  } finally {
    i18n.addResource('en', 'operator', 'help.steps.library.title', 'Open Players');
    stop?.();
  }
});
