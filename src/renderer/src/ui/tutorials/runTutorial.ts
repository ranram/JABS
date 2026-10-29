import { driver } from 'driver.js';
import type { TFunction } from 'i18next';
import { tutorials, type TutorialId, type TutorialStep, type TutorialWorkspace } from './tutorials';
import { setTutorialActive } from './tutorialActivity';
import './tutorials.css';

const queuePanel = '[data-tutorial="queue-panel"][data-opened="true"]';

export type TutorialPopover = {
  host: HTMLElement;
  index: number;
  total: number;
  link?: string;
  missing: boolean;
  previous(): void;
  next(): void;
  close(): void;
  refresh(): void;
};

export function runTutorial({
  id,
  t,
  navigate,
  render,
  onClosed
}: {
  id: TutorialId;
  t: TFunction<'operator'>;
  navigate(workspace: TutorialWorkspace): void;
  render(popover?: TutorialPopover): void;
  onClosed?(): void;
}): () => void {
  const steps: readonly TutorialStep[] = tutorials[id];
  let index = 0;
  let disposed = false;
  let pending = new AbortController();
  let target: HTMLElement | undefined;
  let revealedMenu: HTMLButtonElement | undefined;
  let openedQueue = false;
  const instance = driver({
    animate: false,
    overlayOpacity: 0,
    allowKeyboardControl: false,
    allowClose: true,
    showButtons: [],
    popoverClass: 'jabs-tutorial',
    steps: steps.map((step) => ({
      element: step.target,
      popover: {
        title: escapeText(t(`help.steps.${step.id}.title`)),
        description: formatDescription(t(`help.steps.${step.id}.body`)),
        side: 'bottom',
        align: 'start'
      }
    })),
    onPopoverRender(popover) {
      // Driver treats an empty button list as defaults; JABS supplies its own close control.
      popover.closeButton.remove();
      const host = document.createElement('div');
      popover.footer.replaceChildren(host);
      popover.footer.style.display = 'block';
      render({
        host,
        index,
        total: steps.length,
        link: steps[index].link,
        missing: !target,
        previous: () => void show(index - 1),
        next: () => (index === steps.length - 1 ? close() : void show(index + 1)),
        close,
        refresh: instance.refresh
      });
    },
    onDestroyed: finish
  });

  function closeRevealedMenu() {
    if (revealedMenu?.isConnected && revealedMenu.getAttribute('aria-expanded') === 'true') revealedMenu.click();
    revealedMenu = undefined;
  }
  function revealMenu(name?: TutorialStep['openMenu']) {
    const button = name ? document.querySelector<HTMLButtonElement>(`[data-tutorial="${name}-menu"]`) : undefined;
    if (button !== revealedMenu) closeRevealedMenu();
    if (button && button.getAttribute('aria-expanded') !== 'true') {
      button.click();
      revealedMenu = button;
    }
  }
  function closeOpenedQueue() {
    if (!openedQueue) return;
    document.querySelector(queuePanel)
      ?.closest('[role="dialog"]')
      ?.querySelector<HTMLButtonElement>('.mantine-Modal-close')?.click();
    openedQueue = false;
  }
  function finish() {
    if (disposed) return;
    disposed = true;
    pending.abort();
    closeOpenedQueue();
    closeRevealedMenu();
    document.body.classList.remove('jabs-tutorial-active');
    document.removeEventListener('keydown', keyboard, true);
    document.removeEventListener('scroll', instance.refresh, true);
    setTutorialActive(false);
    render(undefined);
    onClosed?.();
  }
  function close() {
    const menuFocus = target?.closest('[role="menu"]') ? revealedMenu : undefined;
    finish();
    instance.destroy();
    const focus = target?.matches('input, button, select')
      ? target
      : target?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]), select:not([disabled])');
    const fallback = document.querySelector<HTMLElement>('[data-tutorial="help"]');
    (menuFocus?.isConnected
      ? menuFocus
      : focus?.isConnected && !focus.closest('[hidden], [aria-hidden="true"]')
        ? focus
        : fallback
    )?.focus({
      preventScroll: true
    });
  }
  async function show(nextIndex: number) {
    if (disposed || !steps[nextIndex]) return;
    pending.abort();
    const request = new AbortController();
    pending = request;
    const step = steps[nextIndex];
    const workspace = step.workspace ?? steps.find((item) => item.workspace)?.workspace;
    if (workspace) navigate(workspace);
    if (!step.openQueue) closeOpenedQueue();
    const libraryOpen = Boolean(document.querySelector('.player-library-panel'));
    const queueOpen = Boolean(document.querySelector(queuePanel));
    const needsMatches = (step.openLibrary && !libraryOpen) || (step.openQueue && !queueOpen);
    revealMenu(step.openMenu ?? (needsMatches ? 'matches' : undefined));
    if (step.openLibrary && !document.querySelector('.player-library-panel')) {
      const launcher = await waitForTarget('[data-tutorial="players"]', request.signal);
      if (disposed || request.signal.aborted) return;
      launcher?.click();
    }
    if (step.openQueue && !queueOpen) {
      const launcher = await waitForTarget('[data-tutorial="queue-open"]', request.signal);
      if (disposed || request.signal.aborted) return;
      if (launcher) {
        openedQueue = true;
        launcher.click();
      }
    }
    const element = await waitForTarget(step.target, request.signal, step.fallbackTarget);
    if (disposed || request.signal.aborted) return;
    target = element;
    index = nextIndex;
    // Driver 1.9 only checks viewport bounds; also reveal targets inside nested scroll areas.
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    instance.setConfig({
      ...instance.getConfig(),
      steps: instance.getConfig().steps?.map((item, position) => (position === index ? { ...item, element } : item))
    });
    instance.drive(index);
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (event.key === 'Tab') {
      // Keep normal page navigation instead of Driver's tour-only focus loop.
      event.stopPropagation();
    }
  }
  document.body.classList.add('jabs-tutorial-active');
  document.addEventListener('keydown', keyboard, true);
  document.addEventListener('scroll', instance.refresh, true);
  setTutorialActive(true);
  void show(0);
  return close;
}

function escapeText(value: string): string {
  const text = document.createElement('div');
  text.textContent = value;
  return text.innerHTML;
}

function formatDescription(value: string): string {
  // Escape first so only our bold markers can introduce HTML.
  return escapeText(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

function waitForTarget(selector: string, signal: AbortSignal, fallback?: string): Promise<HTMLElement | undefined> {
  return new Promise((resolve) => {
    const findVisible = (query: string) =>
      [...document.querySelectorAll<HTMLElement>(query)].find((element) => {
        if (element.closest('[hidden], [aria-hidden="true"]')) return false;
        let details = element.closest('details');
        while (details) {
          details.open = true;
          details = details.parentElement?.closest('details') ?? null;
        }
        return element.getClientRects().length > 0;
      });
    const visible = () => findVisible(selector) ?? (fallback ? findVisible(fallback) : undefined);
    if (signal.aborted) return resolve(undefined);
    const existing = visible();
    if (existing) return resolve(existing);
    const finish = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve(signal.aborted ? undefined : visible());
    };
    const observer = new MutationObserver(() => {
      if (visible()) finish();
    });
    const timer = window.setTimeout(finish, 1800);
    signal.addEventListener('abort', finish, { once: true });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}
