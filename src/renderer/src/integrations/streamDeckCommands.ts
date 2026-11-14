import type { StingerKind, StingerPlaybackResult } from '@shared/stingers';
import type { SelectedSetState } from '@shared/models';
import { scoreLimitForPlayer } from '@shared/gameProfiles';
import type { StreamDeckCommand, StreamDeckResult } from '@shared/streamDeck';
import type { QueueController } from '../ui/operator/matchQueueContext';
import type { useWorkspaceShortcuts } from '../ui/operator/useWorkspaceShortcuts';
import { currentQueueIndex, nextQueueIndex } from '../ui/operator/queuePresentation';
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
  playStinger?(kind: StingerKind): Promise<StingerPlaybackResult>;
  queue?: QueueController;
  confirmation: ReturnType<typeof useWorkspaceShortcuts>;
  controls?: StreamDeckMatchControls;
};

/** Dispatch Stream Deck actions through the operator controls. */
export function createStreamDeckExecutor(current: () => StreamDeckContext) {
  let pending:
    { id: string; kind: 'queue' | 'players' | 'scores' | 'stinger'; version?: string; revision?: number } | undefined;
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
      const queueChanged = reviewed.kind === 'queue' && queue?.state?.revision !== reviewed.revision;
      const matchChanged =
        (reviewed.kind === 'players' || reviewed.kind === 'scores') && set?.updatedAt !== reviewed.version;
      if (context.blocked || queueChanged || matchChanged) {
        confirmation.cancel();
        return 'blocked';
      }
      return (await confirmation.confirm()) ? 'completed' : 'blocked';
    }
    const liveControl = action.startsWith('score-') || action.startsWith('stinger-') || action === 'swap-commentators';
    const allowedPopups = liveControl
      ? '[role="dialog"]'
      : '[data-tutorial="queue-panel"], [data-tutorial="set-selector"]';
    if (confirmation.confirmation || hasVisiblePopup(allowedPopups)) return 'blocked';
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
    if (context.blocked || (!liveControl && isTypingTarget(document.activeElement))) return 'blocked';
    if (action === 'stinger-perfect' || action === 'stinger-winner') {
      if (!context.playStinger || (action === 'stinger-winner' && (!set || command.expectedVersion !== set.updatedAt)))
        return 'blocked';
      const result = await context.playStinger(action === 'stinger-perfect' ? 'perfect' : 'winner');
      if (result !== 'unconfigured') return result;
      const latest = current().confirmation;
      if (!latest.requestRemoteConfirmation(action, command.id)) return 'blocked';
      pending = { id: command.id, kind: 'stinger' };
      return 'confirmation-required';
    }
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
            : nextQueueIndex(queue.state, queue.liveSetId) < 0
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
