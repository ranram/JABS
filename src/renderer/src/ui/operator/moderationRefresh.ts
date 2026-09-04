import type { PlayerState, SelectedSetState, SetSummary } from '@shared/models';

const blocked = (value: unknown): boolean => value === '[blocked]';

function restoredValue<T>(current: T, refreshed: T): T {
  return blocked(current) ? refreshed : current;
}

function restorePlayer(current: PlayerState, refreshed: PlayerState): PlayerState {
  const characters = current.characters?.map((character, index) =>
    restoredValue(character, refreshed.characters?.[index] ?? character)
  );
  const character = restoredValue(
    current.character,
    refreshed.character ?? refreshed.characters?.[0] ?? current.character
  );
  return {
    ...current,
    name: restoredValue(current.name, refreshed.name),
    prefix: restoredValue(current.prefix, refreshed.prefix),
    sponsor: restoredValue(current.sponsor, refreshed.sponsor),
    xHandle: restoredValue(current.xHandle, refreshed.xHandle),
    pronouns: restoredValue(current.pronouns, refreshed.pronouns),
    characters,
    character
  };
}

function refreshedPlayer(current: PlayerState, refreshed: SelectedSetState): PlayerState {
  return [refreshed.playerOne, refreshed.playerTwo]
    .find((player) => player.entrantId === current.entrantId) ?? current;
}

/** Restore only values hidden by moderation, leaving every operator edit intact. */
export function restoreModeratedSet(
  current: SelectedSetState,
  refreshed: SelectedSetState
): SelectedSetState {
  const restoredPlayerOne = restorePlayer(
    current.playerOne,
    refreshedPlayer(current.playerOne, refreshed)
  );
  const restoredPlayerTwo = restorePlayer(
    current.playerTwo,
    refreshedPlayer(current.playerTwo, refreshed)
  );
  const refreshedDisplayName = blocked(refreshed.displayName)
    ? `${restoredPlayerOne.name} vs ${restoredPlayerTwo.name}`
    : refreshed.displayName;
  return {
    ...current,
    displayName: restoredValue(current.displayName, refreshedDisplayName),
    phase: restoredValue(current.phase, refreshed.phase),
    phaseGroup: restoredValue(current.phaseGroup, refreshed.phaseGroup),
    round: restoredValue(current.round, refreshed.round),
    station: restoredValue(current.station, refreshed.station),
    playerOne: restoredPlayerOne,
    playerTwo: restoredPlayerTwo
  };
}

export function restoreModeratedSummary(
  current: SetSummary,
  refreshed: SelectedSetState
): SetSummary {
  const entrantName = (entrant: NonNullable<SetSummary['entrantOne']>) => {
    const player = [refreshed.playerOne, refreshed.playerTwo]
      .find((candidate) => candidate.entrantId === entrant.id);
    return restoredValue(entrant.name, player?.name ?? entrant.name);
  };
  return {
    ...current,
    phase: restoredValue(current.phase, refreshed.phase),
    phaseGroup: restoredValue(current.phaseGroup, refreshed.phaseGroup),
    round: restoredValue(current.round, refreshed.round),
    station: restoredValue(current.station, refreshed.station),
    entrantOne: current.entrantOne && {
      ...current.entrantOne,
      name: entrantName(current.entrantOne)
    },
    entrantTwo: current.entrantTwo && {
      ...current.entrantTwo,
      name: entrantName(current.entrantTwo)
    }
  };
}
