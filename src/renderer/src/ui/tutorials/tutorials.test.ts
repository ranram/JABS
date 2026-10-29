// @vitest-environment happy-dom
import { act, createElement as h, useState } from 'react';
import { readFileSync } from 'node:fs';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountHook } from '../../hooks/hookTestHarness';
import { initializeI18n, i18n } from '../../i18n';
import { HelpMenu } from './HelpMenu';
import { MatchesMenu } from '../operator/MatchesMenu';
import { MatchQueueModal } from '../operator/MatchQueueModal';
import { MatchQueueContext, type QueueController } from '../operator/matchQueueContext';
import { tutorials } from './tutorials';
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
    <div data-tutorial="assets">
      <button data-tutorial="assets-menu" aria-expanded="false">Media</button>
      <div data-assets-dropdown hidden>
        <button data-folder-action>Open assets folder</button>
        <button data-tutorial="reload-assets">Reload assets</button>
      </div>
    </div>
  `);
  const assetsMenu = fields.querySelector<HTMLButtonElement>('[data-tutorial="assets-menu"]')!;
  assetsMenu.addEventListener('click', () => {
    const expanded = assetsMenu.getAttribute('aria-expanded') !== 'true';
    assetsMenu.setAttribute('aria-expanded', String(expanded));
    fields.querySelector<HTMLElement>('[data-assets-dropdown]')!.hidden = !expanded;
  });
  const secret = fields.querySelector('input')!;
  const change = vi.fn();
  secret.addEventListener('input', change);
  const navigate = vi.fn();
  const help = () => h(MantineProvider, { env: 'test' }, h('div', {},
    h(MatchesMenu, { setSelectorDisabled: true, onOpenSetSelector() {} }),
    h(HelpMenu, { navigate })
  ));
  const mountHelp = () => mountHook(help, true, (view) => view);
  window.localStorage.removeItem('jabs.quick-start.dismissed');
  let view = await mountHelp();
  expect(document.querySelector('.jabs-tutorial .driver-popover-title')?.textContent).toBe('Welcome to JABS!');
  expect(view.container.querySelector('[data-tutorial="matches-menu"]')?.getAttribute('aria-expanded')).toBe('false');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close guide"]')!.click());
  expect(window.localStorage.getItem('jabs.quick-start.dismissed')).toBe('true');
  await view.unmount();
  view = await mountHelp();
  expect(isTutorialActive()).toBe(false);
  navigate.mockClear();
  await act(async () => button('Help', view.container).click());
  const guides = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .map((item) => item.textContent);
  expect(guides.slice(1, 7)).toEqual([
    'Quick Start', 'Connect a start.gg token', 'Run a tournament', 'Use the Match Queue', 'Run an exhibition', 'Use the Player Library'
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
  fields.querySelector('[data-folder-action]')!.addEventListener('click', openFolder);
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
  expect(assetsMenu.getAttribute('aria-expanded')).toBe('false');
  await view.unmount();
});

it.each(['en', 'es-419'])('walks through the queue in %s without changing matches or automation', async (language) => {
  await i18n.changeLanguage(language);
  const t = i18n.getFixedT(language, 'operator');
  fixture(language === 'en' ? '<div class="set-list"></div>' : '<div class="tournament-lookup-row"></div>');
  const mutateQueue = vi.fn();
  const openQueue = vi.fn();
  const closeQueue = vi.fn();
  const navigate = vi.fn();
  function QueueGuide() {
    const [opened, setOpened] = useState(false);
    const controller: QueueController = {
      state: {
        entries: [],
        cursor: null,
        mode: 'manual',
        delayMinutes: 1,
        running: false,
        remainingMs: null,
        revision: 1,
        status: 'empty'
      },
      opened,
      busy: false,
      blocked: false,
      open: () => {
        openQueue();
        setOpened(true);
      },
      close: () => {
        closeQueue();
        setOpened(false);
      },
      hold() {},
      add: mutateQueue,
      act: mutateQueue
    };
    return h(
      MatchQueueContext.Provider,
      { value: controller },
      h(MatchesMenu, { setSelectorDisabled: false, onOpenSetSelector() {} }),
      h(HelpMenu, { navigate }),
      h(MatchQueueModal)
    );
  }
  const view = await mountHook(
    () => h(MantineProvider, { env: 'test' }, h(QueueGuide)),
    false,
    (value) => value
  );
  await act(async () => button(t('help.title'), view.container).click());
  await act(async () => {
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === t('help.guides.matchQueue'))!
      .click();
  });
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe(t('help.steps.queueAdd.title'));
  expect(document.querySelector('.jabs-tutorial')?.textContent).not.toContain(t('help.missing'));
  await act(async () => button(t('help.next')).click());
  expect(openQueue).not.toHaveBeenCalled();
  await act(async () => button(t('help.next')).click());
  expect(openQueue).toHaveBeenCalledOnce();
  expect(document.querySelector('.jabs-tutorial')?.contains(document.activeElement)).toBe(true);
  await act(async () => button(t('help.previous')).click());
  expect(closeQueue).toHaveBeenCalledOnce();
  await act(async () => button(t('help.next')).click());
  for (let index = 2; index < tutorials.matchQueue.length; index++) {
    const popover = document.querySelector('.jabs-tutorial')!;
    expect(popover.querySelector('.driver-popover-title')?.textContent).toBe(
      t(`help.steps.${tutorials.matchQueue[index].id}.title`)
    );
    expect(popover.textContent).not.toContain(t('help.missing'));
      expect(popover.querySelector('.driver-popover-description strong')).not.toBeNull();
      expect(popover.querySelector('.driver-popover-description')?.textContent).not.toContain('**');
    await act(async () => button(t(index === tutorials.matchQueue.length - 1 ? 'help.done' : 'help.next')).click());
  }
  expect(openQueue).toHaveBeenCalledTimes(2);
  expect(closeQueue).toHaveBeenCalledTimes(2);
  expect(mutateQueue).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith('bracket');
  expect(isTutorialActive()).toBe(false);
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

it('opens the library without creating players and renders bold while keeping HTML as text', async () => {
  const content = fixture(`
    <button data-tutorial="matches-menu" aria-expanded="false">Matches</button>
    <div data-matches-dropdown hidden><button data-tutorial="players">Players</button></div>
  `);
  const matches = content.querySelector<HTMLButtonElement>('[data-tutorial="matches-menu"]')!;
  const reveal = vi.fn(() => {
    const expanded = matches.getAttribute('aria-expanded') !== 'true';
    matches.setAttribute('aria-expanded', String(expanded));
    content.querySelector<HTMLElement>('[data-matches-dropdown]')!.hidden = !expanded;
  });
  matches.addEventListener('click', reveal);
  const opened = vi.fn(() => {
    const library = document.createElement('div');
    library.className = 'player-library-panel';
    library.innerHTML =
      '<div class="player-library-toolbar"><div class="player-library-file-actions"><button>Export library</button></div></div><div class="player-library-list"><button data-tutorial="player-library-create">New player</button></div><div class="player-library-workspace"></div>';
    content.append(library);
  });
  content.querySelector('[data-tutorial="players"]')!.addEventListener('click', opened);
  const create = vi.fn();
  content.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).textContent === 'New player') create();
  });
  let popover: TutorialPopover | undefined;
  const t = i18n.getFixedT('en', 'operator');
  const originalTitle = t('help.steps.library.title');
  const originalBody = t('help.steps.library.body');
  i18n.addResource('en', 'operator', 'help.steps.library.title', '<img src=x onerror="alert(1)">Library');
  i18n.addResource('en', 'operator', 'help.steps.library.body',
    '**Players & profiles** <img src=x onerror="alert(1)"> **<svg onload="alert(1)">** <strong>literal</strong> **unfinished');
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
    const description = document.querySelector('.driver-popover-description')!;
    expect([...description.querySelectorAll('strong')].map((element) => element.textContent)).toEqual([
      'Players & profiles', '<svg onload="alert(1)">'
    ]);
    expect(description.querySelector('img, svg, script, a')).toBeNull();
    expect(description.textContent).toBe(
      'Players & profiles <img src=x onerror="alert(1)"> <svg onload="alert(1)"> <strong>literal</strong> **unfinished'
    );
    expect(opened).not.toHaveBeenCalled();
    expect(matches.getAttribute('aria-expanded')).toBe('true');
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
    i18n.addResource('en', 'operator', 'help.steps.library.title', originalTitle);
    i18n.addResource('en', 'operator', 'help.steps.library.body', originalBody);
    stop?.();
  }
});
