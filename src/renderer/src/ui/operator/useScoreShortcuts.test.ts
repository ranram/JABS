// @vitest-environment happy-dom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { mountHook } from '../../hooks/hookTestHarness';
import { useScoreShortcuts } from './useScoreShortcuts';
import { setTutorialActive } from '../tutorials/tutorialActivity';

function press(code: string, extra: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
  return event;
}

it('uses current scores after rerender, enforces exact shortcuts and removes listeners on unmount', async () => {
  const onScore = vi.fn(),
    onReset = vi.fn(),
    onSwap = vi.fn(),
    onSwapCommentators = vi.fn();
  let selectedSet = createTestOverlayState().selectedSet!;
  const hook = await mountHook(
    () =>
      useScoreShortcuts({
        selectedSet,
        disabled: false,
        modalOpen: false,
        onScore,
        onReset,
        onSwap,
        onSwapCommentators
      }),
    true
  );
  for (const code of ['KeyR', 'KeyS', 'KeyC']) press(code, { ctrlKey: true });
  expect(onReset).not.toHaveBeenCalled();
  expect(onSwap).not.toHaveBeenCalled();
  expect(onSwapCommentators).not.toHaveBeenCalled();
  for (const code of ['KeyR', 'KeyS', 'KeyC'])
    expect(press(code, { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
  expect(onReset).toHaveBeenCalledOnce();
  expect(onSwap).toHaveBeenCalledOnce();
  expect(onSwapCommentators).toHaveBeenCalledOnce();
  press('Digit1');
  expect(onScore).toHaveBeenLastCalledWith('one', 1);
  press('Digit2', { shiftKey: true });
  expect(onScore).toHaveBeenCalledOnce();
  selectedSet = { ...selectedSet, playerOne: { ...selectedSet.playerOne, score: 2 } };
  await hook.rerender();
  press('Digit1');
  expect(onScore).toHaveBeenCalledOnce();
  press('Digit1', { shiftKey: true });
  expect(onScore).toHaveBeenLastCalledWith('one', 1);
  for (const target of [2, 3, 5, 7, 10]) {
    selectedSet = {
      ...selectedSet,
      matchFormat: 'first-to',
      bestOf: target * 2 - 1,
      playerOne: { ...selectedSet.playerOne, score: target - 1 }
    };
    await hook.rerender();
    press('Digit1');
    expect(onScore).toHaveBeenLastCalledWith('one', target);
    selectedSet = { ...selectedSet, playerOne: { ...selectedSet.playerOne, score: target } };
    await hook.rerender();
    const callsAtLimit = onScore.mock.calls.length;
    press('Digit1');
    expect(onScore).toHaveBeenCalledTimes(callsAtLimit);
    press('Digit1', { shiftKey: true });
    expect(onScore).toHaveBeenLastCalledWith('one', target - 1);
  }
  for (const [one, two, canAdd] of [
    [7, 5, false],
    [7, 6, true],
    [8, 6, false],
    [9, 9, true],
    [10, 9, false]
  ] as const) {
    for (const side of ['one', 'two'] as const) {
      selectedSet = {
        ...selectedSet,
        matchFormat: 'topanga',
        bestOf: 13,
        playerOne: { ...selectedSet.playerOne, score: side === 'one' ? one : two },
        playerTwo: { ...selectedSet.playerTwo, score: side === 'two' ? one : two }
      };
      await hook.rerender();
      const callsBefore = onScore.mock.calls.length;
      const code = side === 'one' ? 'Digit1' : 'Digit2';
      press(code);
      expect(onScore).toHaveBeenCalledTimes(callsBefore + Number(canAdd));
      if (canAdd) expect(onScore).toHaveBeenLastCalledWith(side, one + 1);
      press(code, { shiftKey: true });
      expect(onScore).toHaveBeenLastCalledWith(side, one - 1);
    }
  }
  await hook.unmount();
  onScore.mockClear();
  press('Digit1', { shiftKey: true });
  expect(onScore).not.toHaveBeenCalled();
});

it('respects busy state, typing, visible popups and the operator toggle with real DOM events', async () => {
  const onScore = vi.fn();
  let disabled = true,
    modalOpen = false;
  const hook = await mountHook(() =>
    useScoreShortcuts({
      selectedSet: createTestOverlayState().selectedSet,
      disabled,
      modalOpen,
      onScore,
      onReset: vi.fn(),
      onSwap: vi.fn(),
      onSwapCommentators: vi.fn()
    })
  );
  press('Digit1');
  disabled = false;
  modalOpen = true;
  await hook.rerender();
  press('Digit1');
  modalOpen = false;
  await hook.rerender();
  for (const extra of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { altKey: true }])
    press('Digit1', extra);
  const input = document.createElement('input');
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  document.body.append(input, editable);
  press('Digit1', {}, input);
  press('Digit1', {}, editable);
  const popup = document.createElement('div');
  popup.setAttribute('role', 'listbox');
  popup.style.visibility = 'visible';
  document.body.append(popup);
  vi.spyOn(popup, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 50, 50)] as unknown as DOMRectList);
  press('Digit1');
  expect(onScore).not.toHaveBeenCalled();
  popup.hidden = true;
  input.type = 'checkbox';
  press('Digit1', {}, input);
  expect(onScore).toHaveBeenCalledOnce();
  await act(async () => hook.current.setEnabled(false));
  press('Digit1', {}, input);
  expect(onScore).toHaveBeenCalledOnce();
  await act(async () => hook.current.setEnabled(true));
  press('Digit1', {}, input);
  expect(onScore).toHaveBeenCalledTimes(2);
  setTutorialActive(true);
  try {
    press('Digit1');
    press('Digit2', { shiftKey: true });
    press('KeyR', { ctrlKey: true, shiftKey: true });
    expect(onScore).toHaveBeenCalledTimes(2);
  } finally {
    setTutorialActive(false);
  }
  press('Digit1');
  expect(onScore).toHaveBeenCalledTimes(3);
  input.remove();
  editable.remove();
  popup.remove();
});
