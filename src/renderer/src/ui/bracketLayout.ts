import type { BracketMatch, BracketScreenState } from '@shared/bracketScreen';

export const bracketWidth = 1848;
const lanesHeight = 864;
const headingHeight = 60;
const laneGap = 24;
const maxCardHeight = 72;
const cardGap = 8;
const advanceWidth = 284;

type Advance = NonNullable<BracketScreenState['snapshot']>['advances'][number];
export type BracketColumn = { roundNumber: number; title: string; matches: BracketMatch[] };
export type PlacedBracketMatch = { match: BracketMatch; x: number; y: number; width: number; column: number };
export type BracketLaneLayout = {
  columns: BracketColumn[];
  placed: PlacedBracketMatch[];
  contentWidth: number;
  bodyHeight: number;
  cardHeight: number;
  advances: Array<{ id: string; label: string; y: number; sourceX: number; sourceY: number }>;
};

export function bracketRounds(matches: readonly BracketMatch[], losers: boolean): BracketColumn[] {
  const grouped = new Map<number, BracketMatch[]>();
  for (const match of matches) {
    const isLosersRound = match.roundNumber < 0;
    if (isLosersRound !== losers) continue;
    const round = grouped.get(match.roundNumber) ?? [];
    round.push(match);
    grouped.set(match.roundNumber, round);
  }
  return [...grouped]
    .sort(([a], [b]) => Math.abs(a) - Math.abs(b))
    .map(([roundNumber, matches]) => ({ roundNumber, title: matches[0].round, matches }));
}

function selectedRounds(matches: readonly BracketMatch[], losers: boolean, start?: number) {
  const rounds = bracketRounds(matches, losers);
  if (start !== undefined) return rounds.filter(({ roundNumber }) => Math.abs(roundNumber) >= Math.abs(start));
  if (losers) return rounds;
  // Large phases need a useful starting round, rather than dozens of unreadably small names.
  const first = rounds.findIndex(({ matches }) => matches.length <= 8);
  return rounds.slice(Math.max(0, first));
}

function orderFeederMatches(columns: BracketColumn[]) {
  // Work back from the finals so each pair of feeder matches sits together.
  // start.gg's set order can scatter those pairs, especially in Losers.
  for (let index = columns.length - 2; index >= 0; index--) {
    const destinations = new Map<string, number>();
    for (const column of columns.slice(index + 1)) {
      for (const match of column.matches) {
        for (const { prerequisite } of match.slots) {
          if (prerequisite && !destinations.has(prerequisite.setId)) {
            destinations.set(prerequisite.setId, destinations.size);
          }
        }
      }
    }
    columns[index].matches.sort(
      (a, b) => (destinations.get(a.id) ?? destinations.size) - (destinations.get(b.id) ?? destinations.size)
    );
  }
  return columns;
}

export function bracketLayout(
  matches: readonly BracketMatch[],
  advances: readonly Advance[] = [],
  winnersRound?: number,
  losersRound?: number
) {
  const winners = orderFeederMatches(selectedRounds(matches, false, winnersRound));
  const losers = orderFeederMatches(selectedRounds(matches, true, losersRound));
  const winnersRows = Math.max(0, ...winners.map(({ matches }) => matches.length));
  const losersRows = Math.max(0, ...losers.map(({ matches }) => matches.length));
  const laneCount = Number(Boolean(winners.length)) + Number(Boolean(losers.length));
  const bodySpace = lanesHeight - headingHeight * laneCount - (laneCount === 2 ? laneGap : 0);
  const rows = Math.max(1, winnersRows + losersRows);
  const winnerHeight = Math.round((bodySpace * winnersRows) / rows);
  return {
    winners: placeLane(winners, winnerHeight, matches, advances),
    losers: placeLane(losers, bodySpace - winnerHeight, matches, advances)
  };
}

function placeLane(
  columns: BracketColumn[],
  bodyHeight: number,
  matches: readonly BracketMatch[],
  advances: readonly Advance[]
): BracketLaneLayout {
  const count = Math.max(1, ...columns.map(({ matches }) => matches.length));
  const spacing = Math.min(cardGap, bodyHeight / count / 6);
  const cardHeight = Math.max(1, Math.min(maxCardHeight, Math.floor((bodyHeight - spacing * (count - 1)) / count)));
  const depths = matchDepths(matches);
  const targets = advances.flatMap((advance) => {
    const source = matches
      .filter((match) => match.state === 3 && match.slots.some((slot) => slot.entrantId === advance.entrantId))
      .sort((a, b) => (depths.get(b.id) ?? 0) - (depths.get(a.id) ?? 0))[0];
    return source && columns.some((column) => column.matches.some(({ id }) => id === source.id))
      ? [{ advance, source }]
      : [];
  });
  const contentWidth = bracketWidth - (targets.length ? advanceWidth : 0);
  const columnWidth = contentWidth / Math.max(1, columns.length);
  const placed: PlacedBracketMatch[] = [];
  const byId = new Map<string, PlacedBracketMatch>();
  columns.forEach((column, columnIndex) => {
    const columnGap = Math.max(
      spacing,
      Math.min(32, (bodyHeight - cardHeight * column.matches.length) / (column.matches.length + 1))
    );
    let hasFeeders = false;
    const desired = column.matches.map((match, index) => {
      const sources = match.slots.flatMap(({ prerequisite }) => {
        const source = prerequisite && byId.get(prerequisite.setId);
        return source ? [source.y] : [];
      });
      hasFeeders ||= sources.length > 0;
      return sources.length
        ? sources.reduce((a, b) => a + b, 0) / sources.length
        : ((index + 0.5) * bodyHeight) / column.matches.length - cardHeight / 2;
    });
    // Connected cards keep their feeder midpoint. Forcing a separate column
    // center or a larger gap would move the card away from its junction.
    const minimumGap = hasFeeders ? spacing : columnGap;
    for (let index = 0; index < desired.length; index++)
      desired[index] = Math.max(0, desired[index], index ? desired[index - 1] + cardHeight + minimumGap : 0);
    for (let index = desired.length - 1; index >= 0; index--)
      desired[index] = Math.min(
        desired[index],
        index === desired.length - 1 ? bodyHeight - cardHeight : desired[index + 1] - cardHeight - minimumGap
      );
    column.matches.forEach((match, index) => {
      const entry = {
        match,
        x: columnIndex * columnWidth + 8,
        y: desired[index],
        width: columnWidth - 48,
        column: columnIndex
      };
      placed.push(entry);
      byId.set(match.id, entry);
    });
  });
  const destinations = targets
    .flatMap(({ source, advance }) => {
      const entry = byId.get(source.id);
      if (!entry) return [];
      const paired = targets.some(
        (target) => target.source.id === source.id && target.advance.entrantId !== advance.entrantId
      );
      const slot = source.slots.findIndex(({ entrantId }) => entrantId === advance.entrantId);
      const y = entry.y + cardHeight * (paired ? (slot === 0 ? 0.25 : 0.75) : 0.5);
      return [
        {
          id: advance.entrantId,
          label: advance.groupCount === 1 ? advance.phaseName : `${advance.phaseName} · ${advance.groupName}`,
          y,
          sourceX: entry.x + entry.width,
          sourceY: y
        }
      ];
    })
    .sort((a, b) => a.y - b.y);
  return { columns, placed, contentWidth, bodyHeight, cardHeight, advances: destinations };
}

function matchDepths(matches: readonly BracketMatch[]) {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    const cachedDepth = depths.get(id);
    if (cachedDepth !== undefined) return cachedDepth;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const match = byId.get(id);
    const previous =
      match?.slots.flatMap(({ prerequisite }) =>
        prerequisite && byId.has(prerequisite.setId) ? [depth(prerequisite.setId)] : []
      ) ?? [];
    const result = previous.length ? 1 + Math.max(...previous) : 0;
    visiting.delete(id);
    depths.set(id, result);
    return result;
  }
  matches.forEach(({ id }) => depth(id));
  return depths;
}

export function bracketConnections(lane: BracketLaneLayout) {
  const byId = new Map(lane.placed.map((entry) => [entry.match.id, entry]));
  const connections = lane.placed.flatMap((target) => {
    const sources = new Map<string, PlacedBracketMatch>();
    for (const { prerequisite } of target.match.slots) {
      const source = prerequisite && byId.get(prerequisite.setId);
      if (source && source.column < target.column) sources.set(source.match.id, source);
    }
    if (!sources.size) return [];
    const feeders = [...sources.values()].map((source) => ({
      x: source.x + source.width,
      y: source.y + lane.cardHeight / 2
    }));
    const endY = target.y + lane.cardHeight / 2;
    return [
      {
        id: target.match.id,
        column: target.column,
        feeders,
        endX: target.x,
        endY,
        low: Math.min(endY, ...feeders.map(({ y }) => y)),
        high: Math.max(endY, ...feeders.map(({ y }) => y))
      }
    ];
  });
  const paths = [];
  for (let column = 1; column < lane.columns.length; column++) {
    const incoming = connections.filter((connection) => connection.column === column);
    const tracks: Array<Array<{ low: number; high: number }>> = [];
    // Only feeders for the same match share a track. Keep unrelated matches
    // apart when their vertical paths overlap.
    const routed = incoming.map((connection) => {
      const { low, high } = connection;
      let track = tracks.findIndex((intervals) =>
        intervals.every((other) => high + 3 < other.low || low > other.high + 3)
      );
      if (track === -1) {
        track = tracks.length;
        tracks.push([]);
      }
      tracks[track].push({ low, high });
      return { ...connection, track };
    });
    for (const connection of routed) {
      const railX = connection.endX - 40 + (32 * (connection.track + 1)) / (tracks.length + 1);
      const feeders = connection.feeders.map(({ x, y }) => {
        const direction = Math.sign(connection.endY - y);
        const radius = Math.min(5, Math.abs(connection.endY - y) / 2, (railX - x) / 2);
        return direction
          ? `M ${x} ${y} H ${railX - radius} Q ${railX} ${y} ${railX} ${y + direction * radius} V ${connection.endY}`
          : `M ${x} ${y} H ${railX}`;
      });
      // One straight connection enters the aligned match at its center.
      const path = `${feeders.join(' ')} M ${railX} ${connection.endY} H ${connection.endX}`;
      paths.push({
        id: connection.id,
        path,
        railX,
        endY: connection.endY,
        fromY: connection.low,
        toY: connection.high,
        column
      });
    }
  }
  return paths;
}
