type MediaIdentity = { localPlayerId?: string; playerId?: string; entrantId?: string; name: string };

/** Create fresh controls when the player or match changes, discarding unfinished drags for the previous player. */
export function mediaInteractionKey(player: MediaIdentity, context: readonly unknown[]): string {
  return JSON.stringify([context, player.localPlayerId, player.playerId, player.entrantId, player.name]);
}
