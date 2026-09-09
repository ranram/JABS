import { describe, expect, it } from 'vitest';
import {
  parseStartggEventsCache,
  parseStartggPhaseGroupPageCache,
  parseStartggPhasesCache,
  parseStartggSetPageCache
} from './startggCache';

describe('start.gg cache contracts', () => {
  it('normalizes cached event and phase text', () => {
    expect(
      parseStartggEventsCache([
        {
          id: ' event-1 ',
          name: ' Singles ',
          videogame: { id: ' game-1 ', name: ' Guilty Gear Strive ' }
        }
      ])
    ).toEqual([
      {
        id: 'event-1',
        name: 'Singles',
        videogame: { id: 'game-1', name: 'Guilty Gear Strive' }
      }
    ]);
    expect(parseStartggPhasesCache([{ id: ' phase-1 ', name: ' Pools ' }])).toEqual([
      { id: 'phase-1', name: 'Pools' }
    ]);
  });

  it('accepts complete pool and set pages while trimming optional display text', () => {
    const pageInfo = { page: 1, perPage: 25, total: 1, totalPages: 1 };
    expect(
      parseStartggPhaseGroupPageCache({
        phaseGroups: [{ id: ' group-1 ', displayIdentifier: ' A1 ' }],
        pageInfo
      })
    ).toEqual({
      phaseGroups: [{ id: 'group-1', displayIdentifier: 'A1' }],
      pageInfo
    });
    expect(
      parseStartggSetPageCache({
        sets: [
          {
            id: ' set-1 ',
            round: ' Winners Final ',
            station: '   ',
            streamName: ' mainstage ',
            streamSource: ' TWITCH ',
            entrantOne: { id: ' entrant-1 ', name: ' Alpha ' }
          }
        ],
        pageInfo
      })
    ).toEqual({
      sets: [
        {
          id: 'set-1',
          round: 'Winners Final',
          station: undefined,
          streamName: 'mainstage',
          streamSource: 'TWITCH',
          entrantOne: { id: 'entrant-1', name: 'Alpha' }
        }
      ],
      pageInfo
    });
  });

  it('rejects invalid identities, collection shapes, and pagination', () => {
    expect(parseStartggEventsCache([{ id: '', name: 'Singles' }])).toBeUndefined();
    expect(parseStartggPhasesCache({ id: 'phase-1', name: 'Pools' })).toBeUndefined();
    expect(
      parseStartggPhaseGroupPageCache({
        phaseGroups: [],
        pageInfo: { page: 0, perPage: 25, total: 0, totalPages: 0 }
      })
    ).toBeUndefined();
    expect(
      parseStartggSetPageCache({
        sets: [{ id: 'set-1', entrantOne: { id: 'entrant-1', name: '' } }],
        pageInfo: { page: 1, perPage: 25, total: 1, totalPages: 1 }
      })
    ).toBeUndefined();
  });
});
