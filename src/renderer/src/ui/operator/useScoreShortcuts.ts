import { useEffect, useState } from 'react';
import { scoreLimitForBestOf } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';

type ScoreShortcutsOptions = {
  selectedSet?: SelectedSetState;
  disabled: boolean;
  modalOpen: boolean;
  onScore(side: 'one' | 'two', score: number): void;
  onReset(): void;
  onSwap(): void;
  onSwapCommentators(): void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [role="textbox"]'
  );
}

function hasVisiblePopup(): boolean {
  const popups = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
  );
  return Array.from(popups).some((popup) => popup.getClientRects().length > 0
    && getComputedStyle(popup).visibility === 'visible'
    && !popup.closest('[hidden], [aria-hidden="true"], [inert]'));
}

export function useScoreShortcuts({ selectedSet, disabled, modalOpen, onScore, onReset, onSwap, onSwapCommentators }: ScoreShortcutsOptions) {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.metaKey
        || !enabled || isTypingTarget(event.target) || modalOpen || disabled) return;
      if (hasVisiblePopup()) return;

      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        event.preventDefault();
        onSwapCommentators();
        return;
      }
      if (!selectedSet) return;

      if (event.ctrlKey && event.shiftKey && event.code === 'KeyR') {
        event.preventDefault();
        onReset();
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyS') {
        event.preventDefault();
        onSwap();
        return;
      }
      if (event.ctrlKey) return;

      const side = event.code === 'Digit1' ? 'one' : event.code === 'Digit2' ? 'two' : undefined;
      if (!side) return;
      const current = side === 'one' ? selectedSet.playerOne.score : selectedSet.playerTwo.score;
      const limit = scoreLimitForBestOf(selectedSet.gameId, selectedSet.bestOf);
      const next = current + (event.shiftKey ? -1 : 1);
      if (next < 0 || next > limit) return;

      event.preventDefault();
      onScore(side, next);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSet, disabled, modalOpen, onScore, onReset, onSwap, onSwapCommentators, enabled]);
  return { enabled, setEnabled };
}
