// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { expect, it, vi } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import {
  bracketScreenStateSchema,
  type BracketMatch,
  type BracketScreenState,
  type BracketSettings
} from '@shared/bracketScreen';
import { mountView } from '../renderer/src/hooks/hookTestHarness';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { BracketScreenControls } from '../renderer/src/ui/operator/BracketScreenControls';
import { BracketPresentation } from '../renderer/src/ui/BracketScreen';
import { bracketLayout, bracketConnections } from '../renderer/src/ui/bracketLayout';

const transport = vi.hoisted(() => ({
  state: undefined as BracketScreenState | undefined,
  groups: vi.fn(),
  save: vi.fn(),
  logo: vi.fn(async (id: string) => `data:image/png;base64,${id}`)
}));
vi.mock('../renderer/src/hooks/useBracketScreenState', () => ({
  useBracketScreenState: () => ({ state: transport.state })
}));
vi.mock('../renderer/src/hooks/useOverlayState', () => ({
  useOverlayState: () => ({ state: { selectedSet: { broadcast: { logoAssetId: 'rails.png' } } } })
}));
vi.mock('../renderer/src/api', () => ({
  api: {
    bracketScreenState: async () => transport.state,
    updateBracketScreenSettings: transport.save,
    phaseGroups: transport.groups,
    logoAssetUrl: transport.logo,
    refreshBracketScreen: async () => transport.state
  }
}));

it('limits large brackets to readable views and configures pending pools without loading the entire phase', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  const matches: BracketMatch[] = Array.from({ length: 32 }, (_, index) => ({
    id: String(index + 1),
    roundNumber: 1,
    round: 'Winners Round 1',
    state: 1,
    slots: [{}, {}]
  }));
  matches.push({
    id: '100',
    roundNumber: 2,
    round: 'Winners Round 2',
    state: 2,
    slots: [{ prerequisite: { setId: '1', placement: 1 } }, { prerequisite: { setId: '2', placement: 1 } }]
  });
  matches.push({
    id: '101',
    roundNumber: -1,
    round: 'Losers Round 1',
    state: 1,
    slots: [{ prerequisite: { setId: '1', placement: 2 } }, {}]
  });
  const automatic = bracketLayout(matches);
  expect(automatic.winners.columns.map(({ roundNumber }) => roundNumber)).toEqual([2]);
  const full = bracketLayout(matches, [], 1, -1);
  expect(full.winners.placed.length + full.losers.placed.length).toBe(matches.length);
  for (const lane of [full.winners, full.losers])
    for (const entry of lane.placed) {
      expect(entry.y).toBeGreaterThanOrEqual(0);
      expect(entry.y + lane.cardHeight).toBeLessThanOrEqual(lane.bodyHeight);
      const next = lane.placed.find((other) => other.column === entry.column && other.y > entry.y);
      if (next) expect(next.y - entry.y).toBeGreaterThanOrEqual(lane.cardHeight);
    }
  const merged = bracketConnections(full.winners);
  expect(merged).toHaveLength(1);
  const nextMatch = full.winners.placed.find(({ match }) => match.id === '100')!;
  const feederCenters = full.winners.placed
    .filter(({ match }) => ['1', '2'].includes(match.id))
    .map(({ y }) => y + full.winners.cardHeight / 2);
  expect(merged[0].endY).toBeCloseTo((feederCenters[0] + feederCenters[1]) / 2);
  expect(merged[0].endY).toBeCloseTo(nextMatch.y + full.winners.cardHeight / 2);
  expect(merged[0].path.endsWith(`M ${merged[0].railX} ${merged[0].endY} H ${nextMatch.x}`)).toBe(true);
  expect(bracketConnections(full.losers)).toHaveLength(0);
  expect(full.winners.cardHeight).not.toBe(full.losers.cardHeight);
  // A full first Losers round stays visible, even when later rounds have fewer sets.
  const losers: BracketMatch[] = Array.from({ length: 8 }, (_, index) => ({
    id: String(200 + index),
    roundNumber: -1,
    round: 'Losers Round 1',
    state: 1,
    slots: [{}, {}]
  }));
  losers.push(
    ...Array.from({ length: 4 }, (_, index): BracketMatch => ({
      id: String(300 + index),
      roundNumber: -2,
      round: 'Losers Round 2',
      state: 1,
      slots: [
        { prerequisite: { setId: String(200 + index * 2), placement: 1 } },
        { prerequisite: { setId: String(201 + index * 2), placement: 1 } }
      ]
    }))
  );
  const centered = bracketLayout(losers).losers;
  expect(centered.columns.map(({ roundNumber }) => roundNumber)).toEqual([-1, -2]);
  const later = centered.placed.filter(({ column }) => column === 1);
  const topMargin = later[0].y;
  const bottomMargin = centered.bodyHeight - later.at(-1)!.y - centered.cardHeight;
  expect(topMargin).toBeCloseTo(bottomMargin);
  const firstRound = centered.placed.filter(({ column }) => column === 0);
  expect(later[1].y - later[0].y - centered.cardHeight).toBeGreaterThan(
    firstRound[1].y - firstRound[0].y - centered.cardHeight
  );
  const routes = bracketConnections(centered);
  expect(routes).toHaveLength(4);
  for (const route of routes) {
    const target = centered.placed.find(({ match }) => match.id === route.id)!;
    const centers = target.match.slots.map(
      ({ prerequisite }) =>
        centered.placed.find(({ match }) => match.id === prerequisite!.setId)!.y + centered.cardHeight / 2
    );
    expect(route.endY).toBeCloseTo((centers[0] + centers[1]) / 2);
    expect(route.path).not.toContain(' C ');
  }
  // Reproduce scattered feeder pairs, then trace them through another round.
  // Both sides must arrange the whole chain without changing the fetched data.
  for (const sign of [1, -1]) {
    const prefix = sign > 0 ? 1000 : 2000;
    const makeMatch = (id: number, round: number, feeders: number[] = []): BracketMatch => ({
      id: String(prefix + id),
      roundNumber: sign * round,
      round: `Round ${round}`,
      state: 1,
      slots: [0, 1].map((slot) =>
        feeders[slot] === undefined
          ? {}
          : {
              prerequisite: { setId: String(prefix + feeders[slot]), placement: 1 }
            }
      ) as BracketMatch['slots']
    });
    const scattered = [
      ...Array.from({ length: 7 }, (_, index) => makeMatch(index + 1, 1)),
      ...[[6], [7, 1], [2, 3], [4, 5]].map((feeders, index) => makeMatch(10 + index, 2, feeders)),
      makeMatch(20, 3, [12, 10]),
      makeMatch(21, 3, [13, 11])
    ];
    const original = JSON.stringify(scattered);
    const arranged = bracketLayout(scattered);
    const lane = sign > 0 ? arranged.winners : arranged.losers;
    expect(JSON.stringify(scattered)).toBe(original);
    expect(lane.placed).toHaveLength(scattered.length);
    for (const route of bracketConnections(lane)) {
      const target = lane.placed.find(({ match }) => match.id === route.id)!;
      const feeders = target.match.slots.flatMap(({ prerequisite }) => {
        const source = prerequisite && lane.placed.find(({ match }) => match.id === prerequisite.setId);
        return source ? [source.y + lane.cardHeight / 2] : [];
      });
      expect(route.endY).toBeCloseTo(feeders.reduce((sum, y) => sum + y, 0) / feeders.length);
    }
    for (let column = 0; column < lane.columns.length - 1; column++) {
      const next = lane.columns[column + 1].matches;
      const destinations = lane.columns[column].matches.map(({ id }) =>
        next.findIndex(({ slots }) => slots.some(({ prerequisite }) => prerequisite?.setId === id))
      );
      expect(destinations.every((destination, index) => index === 0 || destination >= destinations[index - 1])).toBe(
        true
      );
    }
  }
  // Three qualifiers can include both players from the last Winners set.
  // Check a dense pool too: labels must stay attached to their own player rows.
  const qualifyingSets: BracketMatch[] = [
    {
      id: '900',
      roundNumber: 2,
      round: 'Winners Final',
      state: 3,
      winnerId: '901',
      slots: [
        { entrantId: '901', score: 2 },
        { entrantId: '902', score: 1 }
      ]
    },
    {
      id: '910',
      roundNumber: -1,
      round: 'Losers Final',
      state: 3,
      winnerId: '903',
      slots: [
        { entrantId: '903', score: 2 },
        { entrantId: '904', score: 1 }
      ]
    }
  ];
  const qualifiers = ['902', '903', '901'].map((entrantId) => ({
    entrantId,
    phaseId: '21',
    groupId: entrantId,
    phaseName: 'Round 2',
    groupName: entrantId
  }));
  for (const pool of [qualifyingSets, [...matches.filter(({ roundNumber }) => roundNumber === 1), ...qualifyingSets]]) {
    const qualifying = bracketLayout(pool, qualifiers, 1, -1);
    expect(qualifying.winners.advances.map(({ id }) => id)).toEqual(['901', '902']);
    const final = qualifying.winners.placed.find(({ match }) => match.id === '900')!;
    expect(qualifying.winners.advances[0].y).toBeCloseTo(final.y + qualifying.winners.cardHeight / 4);
    expect(qualifying.winners.advances[1].y).toBeCloseTo(final.y + (qualifying.winners.cardHeight * 3) / 4);
    const loserFinal = qualifying.losers.placed.find(({ match }) => match.id === '910')!;
    expect(qualifying.losers.advances).toHaveLength(1);
    expect(qualifying.losers.advances[0].id).toBe('903');
    expect(qualifying.losers.advances[0].y).toBeCloseTo(loserFinal.y + qualifying.losers.cardHeight / 2);
    for (const lane of [qualifying.winners, qualifying.losers])
      for (const advance of lane.advances) {
        expect(advance.y).toBe(advance.sourceY);
        expect(advance.y).toBeGreaterThanOrEqual(0);
        expect(advance.y).toBeLessThanOrEqual(lane.bodyHeight);
      }
  }
  const updatedAt = '2026-10-13T00:00:00Z';
  transport.state = bracketScreenStateSchema.parse({
    settings: { stylingGameId: 'street-fighter-6', updatedAt }
  });
  transport.save.mockImplementation(async (settings: BracketSettings) => {
    transport.state = {
      settings: { ...settings, updatedAt: new Date(Date.parse(settings.updatedAt) + 1).toISOString() }
    };
    return transport.state;
  });
  transport.groups.mockResolvedValue({
    phaseGroups: [{ id: '30', displayIdentifier: 'A1' }],
    pageInfo: { total: 1, totalPages: 1 }
  });
  let eventId: string | undefined;
  let phases = [] as { id: string; name: string }[];
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(BracketScreenControls, {
        eventId,
        phases,
        profiles: Object.values(gameProfiles),
        logos: [{ id: 'local.png', label: 'Local logo' }]
      })
    )
  );
  expect(transport.groups).not.toHaveBeenCalled();
  eventId = '10';
  phases = [{ id: '20', name: 'Top 64' }];
  await view.rerender();
  expect(transport.groups).toHaveBeenCalledWith('20', 1, 100);
  expect(transport.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ scope: { eventId: '10', phaseId: '20', phaseGroupId: '30' } })
  );
  const scope = transport.state!.settings.scope!;
  transport.state!.snapshot = {
    scope,
    tournamentName: 'Weekly Finals',
    eventName: 'Singles',
    phaseName: 'Pool',
    groupName: 'A1',
    completed: false,
    fetchedAt: updatedAt,
    advances: [{ entrantId: '1', phaseId: '21', groupId: '31', phaseName: 'Round 2', groupName: 'B1' }],
    matches: [
      {
        id: 'preview_30_1_0',
        roundNumber: 1,
        round: 'Winners Round 1',
        state: 3,
        winnerId: '1',
        slots: [
          { entrantId: '1', name: 'ひなお/Hinao', country: 'JP', score: 2 },
          { entrantId: '2', name: 'Beta', score: -1 }
        ]
      },
      matches.at(-1)!
    ]
  };
  await view.rerender();
  expect(view.container.querySelector('.bracket-player.is-winner')?.textContent).toContain('ひなお/Hinao');
  const pendingPlayers = [...view.container.querySelectorAll('.bracket-player.is-pending')];
  expect(pendingPlayers).toHaveLength(2);
  for (const player of pendingPlayers) {
    expect(player.textContent?.trim()).toBe('');
    expect(player.querySelector('strong')?.getAttribute('title')).toBe('');
    expect(player.querySelector('img')).toBeNull();
  }
  expect(view.container.querySelector('.bracket-player.is-loser .bracket-score')?.textContent).toBe('DQ');
  expect(view.container.querySelector('.bracket-flag img')?.getAttribute('alt')).toBe('JP');
  expect(view.container.querySelector('.bracket-round-title')?.textContent).toBe('Winners Round 1');
  expect(view.container.querySelector('.bracket-advance')?.textContent).toBe('Round 2 · B1');
  expect(view.container.querySelector('.bracket-screen footer')).toBeNull();
  expect(view.container.querySelectorAll('.bracket-lane')).toHaveLength(2);
  const logo = [...view.container.querySelectorAll('label')].find((label) => label.textContent === 'Logo')!;
  await act(async () => (document.getElementById(logo.htmlFor) as HTMLElement).click());
  const option = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent === 'Local logo')!;
  await act(async () => (option as HTMLElement).click());
  expect(transport.save).toHaveBeenLastCalledWith(expect.objectContaining({ logoAssetId: 'local.png' }));
  await view.unmount();

  const live = transport.state!;
  live.snapshot = {
    scope,
    tournamentName: 'Weekly Finals',
    eventName: 'Singles',
    phaseName: 'Pool',
    groupName: 'A1',
    completed: false,
    fetchedAt: updatedAt,
    advances: [{ entrantId: '1', phaseId: '21', groupId: '31', phaseName: 'Round 2', groupName: 'B1' }],
    matches: matches.slice(0, 1)
  };
  live.settings.showBackground = false;
  const obs = await mountView(() => h(BracketPresentation, { state: live }));
  expect(obs.container.querySelector('.bracket-screen')?.classList.contains('is-transparent-background')).toBe(true);
  expect(obs.container.querySelector('header img')?.getAttribute('src')).toBe('data:image/png;base64,local.png');
  expect(obs.container.querySelector('[data-entrance="winners-column-0"]')).not.toBeNull();
  live.snapshot = { ...live.snapshot, phaseName: 'Top 16', groupName: '1', groupCount: 1 };
  await obs.rerender();
  expect(obs.container.querySelector('header small')?.textContent).toBe('Singles · Top 16');
  live.settings.heading = 'Finals';
  live.settings.eventLabel = 'SF6';
  await obs.rerender();
  expect(obs.container.querySelector('header > div > span')?.textContent).toBe('Finals');
  expect(obs.container.querySelector('header small')?.textContent).toBe('SF6 · Top 16');
  live.settings.heading = '';
  live.settings.eventLabel = '';
  await obs.rerender();
  expect(obs.container.querySelector('header > div > span')?.textContent).toBe('Bracket');
  expect(obs.container.querySelector('header small')?.textContent).toBe('Singles · Top 16');
  live.snapshot.groupCount = 2;
  await obs.rerender();
  expect(obs.container.querySelector('header small')?.textContent).toBe('Singles · Top 16 · 1');
  live.settings = { ...live.settings, scope: { ...scope, phaseGroupId: '31' } };
  await obs.rerender();
  expect(obs.container.querySelector('.bracket-match')).toBeNull();
  await obs.unmount();
});
