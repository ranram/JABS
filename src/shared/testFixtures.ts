import type { GameId } from './gameProfiles';
import type { OverlayState, SetSummary } from './models';
import type { CustomScoreboard } from './customScoreboards';

export function createTestOverlayState(gameId: GameId = 'street-fighter-6'): OverlayState {
  return {
    selectedSet: {
      displayName: 'Waiting for set',
      gameId,
      assetCatalogSlug: gameId,
      bestOf: 3,
      matchFormat: 'best-of',
      broadcast: { infoBarEnabled: false, logoEnabled: false },
      gameHistory: [],
      playerOne: { entrantId: 'p1', name: 'Player 1', score: 0 },
      playerTwo: { entrantId: 'p2', name: 'Player 2', score: 0 },
      updatedAt: '2026-08-12T00:00:00.000Z'
    }
  };
}

export function createTestCustomScoreboard(overrides: Partial<CustomScoreboard> = {}): CustomScoreboard {
  const region = () => ({ x: 0, y: 0, width: 100, height: 40, align: 'left' as const });
  const fields = () => ({
    flag: region(),
    sponsor: region(),
    name: region(),
    pronouns: region(),
    seed: region(),
    score: region()
  });
  return {
    version: 1,
    id: 'test',
    name: 'Test scoreboard',
    frameRevision: '1',
    regions: {
      playerOne: region(),
      playerTwo: region(),
      matchLabel: region(),
      logo: region(),
      infoLeft: region(),
      infoCenter: region(),
      infoRight: region()
    },
    playerElements: { playerOne: fields(), playerTwo: fields() },
    visibility: {
      flags: true,
      sponsors: true,
      xHandles: false,
      pronouns: false,
      seeds: false,
      round: true,
      tournamentLogo: false,
      bottomRails: true,
      infoLeft: true,
      infoCenter: true,
      infoRight: true
    },
    typography: { textColor: '#ffffff', outline: 'none', nameSize: 20, metaSize: 20, scoreSize: 30, contextSize: 20 },
    ...overrides
  };
}

export function createTestTopEightSets(): SetSummary[] {
  const set = (id: string, roundNumber: number, sources: Array<[string, number]> = []): SetSummary => ({
    id, roundNumber, round: id, phaseGroupId: 'finals', phaseOrder: 2, state: '1',
    prerequisites: sources.map(([setId, placement]) => ({ setId, placement }))
  });
  const opening = ['ws1', 'ws2', 'lo1', 'lo2'].map((id, index) => ({
    ...set(id, index < 2 ? 1 : -1),
    entrantOne: { id: `${index * 2 + 1}`, name: `Player ${index * 2 + 1}` },
    entrantTwo: { id: `${index * 2 + 2}`, name: `Player ${index * 2 + 2}` }
  }));
  return [...opening,
    set('q1', -2, [['ws1', 2], ['lo1', 1]]),
    set('q2', -2, [['ws2', 2], ['lo2', 1]]),
    set('wf', 2, [['ws1', 1], ['ws2', 1]]),
    set('ls', -3, [['q1', 1], ['q2', 1]]),
    set('lf', -4, [['wf', 2], ['ls', 1]]),
    set('gf', 3, [['wf', 1], ['lf', 1]]),
    set('reset', 4, [['gf', 1], ['gf', 2]])
  ];
}
