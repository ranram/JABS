import type { SelectedSetState } from '@shared/models';
import { scoreLimitForPlayer } from '@shared/gameProfiles';
import type { StreamDeckCommand, StreamDeckResult } from '@shared/streamDeck';
import type { QueueController } from '../ui/operator/matchQueueContext';
import type { useWorkspaceShortcuts } from '../ui/operator/useWorkspaceShortcuts';
import { currentQueueIndex } from '../ui/operator/queuePresentation';
import { hasVisiblePopup, isTypingTarget } from '../ui/operator/useScoreShortcuts';

export type StreamDeckMatchControls = {
  score(side: 'one' | 'two', score: number): Promise<boolean | void>;
  swap(): Promise<boolean | void>;
  reset(): Promise<boolean | void>;
  commentators(): Promise<unknown>;
};
export type StreamDeckContext = {
  selectedSet?: SelectedSetState;
  blocked: boolean;
  selectorAvailable: boolean;
  openSelector(): void;
  openPlayers(): void;
  queue?: QueueController;
  confirmation: ReturnType<typeof useWorkspaceShortcuts>;
  controls?: StreamDeckMatchControls;
};

/** Receives logical commands, never synthetic key events or plugin code. */
export function createStreamDeckExecutor(current: () => StreamDeckContext) {
  let pending: { id: string; kind: 'queue' | 'players' | 'scores'; version?: string; revision?: number } | undefined;
  return async (command: StreamDeckCommand): Promise<StreamDeckResult> => {
    const context = current();
    const { selectedSet: set, queue, controls, confirmation } = context;
    const { action } = command;
    if (Date.now() > command.expiresAt) return 'blocked';
    if (action === 'confirm' || action === 'cancel') {
      if (!pending || command.confirmationId !== pending.id || confirmation.confirmationId !== pending.id)
        return 'blocked';
      const reviewed = pending;
      pending = undefined;
      if (action === 'cancel') {
        confirmation.cancel();
        return 'completed';
      }
      if (
        context.blocked ||
        (reviewed.kind === 'queue' ? queue?.state?.revision !== reviewed.revision : set?.updatedAt !== reviewed.version)
      ) {
        confirmation.cancel();
        return 'blocked';
      }
      return (await confirmation.confirm()) ? 'completed' : 'blocked';
    }
    if (confirmation.confirmation || hasVisiblePopup('[data-tutorial="queue-panel"], [data-tutorial="set-selector"]'))
      return 'blocked';
    if (action === 'open-players') {
      context.openPlayers();
      return 'completed';
    }
    if (action === 'open-queue') {
      if (!queue) return 'blocked';
      queue.open();
      return 'completed';
    }
    if (action === 'open-selector') {
      if (!context.selectorAvailable) return 'blocked';
      context.openSelector();
      return 'completed';
    }
    if (context.blocked || isTypingTarget(document.activeElement)) return 'blocked';
    if (action.startsWith('queue-') || action === 'clear-queue') {
      if (
        !queue?.state ||
        queue.busy ||
        !queue.context ||
        queue.context.eventId !== queue.state.context?.eventId ||
        command.queueRevision !== queue.state.revision ||
        queue.state.status === 'loading'
      )
        return 'blocked';
      if (action === 'queue-toggle') {
        if (!queue.state.running && (queue.blocked || !queue.state.entries.length)) return 'blocked';
        return (await queue.act({ action: queue.state.running ? 'pause' : 'start' })) ? 'completed' : 'failed';
      }
      if (queue.blocked) return 'blocked';
      if (action !== 'clear-queue') {
        const index = currentQueueIndex(queue.state, queue.liveSetId);
        if (
          action === 'queue-previous'
            ? index === null || index === 0
            : !queue.state.entries.length || (index !== null && index >= queue.state.entries.length - 1)
        )
          return 'blocked';
        return (await queue.act({ action: action === 'queue-next' ? 'next' : 'previous' })) ? 'completed' : 'failed';
      }
    }
    if (action === 'clear-queue' || action === 'clear-players' || action === 'reset-scores') {
      const kind = action === 'clear-queue' ? 'queue' : action === 'clear-players' ? 'players' : 'scores';
      if (kind !== 'queue' && (!set || command.expectedVersion !== set.updatedAt)) return 'blocked';
      if (!confirmation.requestRemoteConfirmation(kind, command.id)) return 'blocked';
      pending = { id: command.id, kind, version: set?.updatedAt, revision: queue?.state?.revision };
      return 'confirmation-required';
    }
    if (!controls) return 'blocked';
    if (action === 'swap-commentators') {
      await controls.commentators();
      return 'completed';
    }
    if (!set || command.expectedVersion !== set.updatedAt) return 'blocked';
    if (action === 'swap-players') return (await controls.swap()) === false ? 'failed' : 'completed';
    if (action.startsWith('score-')) {
      const side = action.startsWith('score-p1') ? 'one' : 'two';
      const player = side === 'one' ? set.playerOne : set.playerTwo;
      const score = player.score + (action.endsWith('-up') ? 1 : -1);
      if (score < 0 || (score > player.score && score > scoreLimitForPlayer(set, side))) return 'blocked';
      return (await controls.score(side, score)) === false ? 'failed' : 'completed';
    }
    return 'blocked';
  };
}
