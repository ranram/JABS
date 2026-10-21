import { describe, expect, it } from 'vitest';
import { topEightMatchupsStateSchema } from './topEightMatchups';
import { setVersusStatRow, versusScreenStateSchema, versusStatTypes } from './versusScreen';

const topEightSettings = {
  stylingGameId: 'street-fighter-6',
  assetCatalogSlug: 'street-fighter-6',
  tournamentName: 'Finals',
  updatedAt: '2026-10-01T00:00:00Z',
  matchups: Array.from({ length: 4 }, (_, index) => ({
    bracket: index < 2 ? 'winners' : 'losers',
    players: [{ name: 'One' }, { name: 'Two' }]
  }))
};

describe('broadcast composition contracts', () => {
  it('migrates Versus row settings and rejects duplicate, unknown, or excessive stats', () => {
    const legacy = {
      stylingGameId: 'tekken-8',
      showTournamentLogo: true,
      showSponsorLogos: true,
      mediaMode: 'character',
      updatedAt: '2026-10-15T00:00:00Z'
    };
    const settings = versusScreenStateSchema.parse(legacy);
    expect(settings.statRows).toEqual(versusStatTypes);
    expect(settings.showHeadToHead).toBe(true);
    expect(settings.showMatchBackdrop).toBe(true);
    expect(versusScreenStateSchema.parse({ ...legacy, showMatchBackdrop: false }).showMatchBackdrop).toBe(false);
    for (const statRows of [['age', 'age'], ['unknown'], [...versusStatTypes, 'age']])
      expect(versusScreenStateSchema.safeParse({ ...legacy, statRows }).success).toBe(false);
    expect(versusScreenStateSchema.parse({ ...legacy, statRows: [], showHeadToHead: false }).statRows).toEqual([]);
    expect(setVersusStatRow([...versusStatTypes], 0, 'nickname')).toEqual(['nickname', 'sponsor', 'seed', 'age']);
    expect(setVersusStatRow([...versusStatTypes], 1)).toEqual(['age', 'seed', 'nickname']);
    expect(setVersusStatRow(['sponsor'], 1, 'age')).toEqual(['sponsor', 'age']);
    expect(setVersusStatRow(['age', 'seed'], 3, 'age')).toEqual(['seed', 'age']);
    const match = {
      tournamentName: 'Major',
      eventName: 'Singles',
      phase: 'Top 8',
      round: 'Grand Final',
      playerOneScore: 3,
      playerTwoScore: 1
    };
    const history = {
      tournamentName: 'Current Major',
      playerOnePlacements: [],
      playerTwoPlacements: [],
      headToHead: Array(4).fill(match)
    };
    expect(versusScreenStateSchema.parse({ ...legacy, history }).history?.headToHead).toHaveLength(4);
    expect(
      versusScreenStateSchema.safeParse({ ...legacy, history: { ...history, headToHead: Array(5).fill(match) } })
        .success
    ).toBe(false);
  });
  it('rejects unreadable Top 8 settings and normalizes names before checking limits', () => {
    // These bounds also apply to native saves. Names count UTF-16 units, so each emoji uses two.
    for (const [name, valid] of [
      ['\uFEFF  Player One  \uFEFF', true],
      ['\u0085Player One\u0085', true],
      ['😀'.repeat(50), true],
      ['😀'.repeat(51), false],
      ['  ', false]
    ] as const) {
      const input = structuredClone(topEightSettings);
      input.matchups[0]!.players[0]!.name = name;
      const parsed = topEightMatchupsStateSchema.safeParse(input);
      expect(parsed.success, `name: ${JSON.stringify(name)}`).toBe(valid);
      if (parsed.success) expect(parsed.data.matchups[0]!.players[0].name).toBe(name.trim());
    }

    for (const length of [100, 101]) {
      const input = structuredClone(topEightSettings);
      Object.assign(input.matchups[0]!.players[0]!, { sponsor: 'S'.repeat(length) });
      expect(topEightMatchupsStateSchema.safeParse(input).success, `sponsor length ${length}`).toBe(length === 100);
    }
    for (const length of [120, 121]) {
      expect(
        topEightMatchupsStateSchema.safeParse({ ...topEightSettings, eventName: 'E'.repeat(length) }).success,
        `event length ${length}`
      ).toBe(length === 120);
    }

    const wrongOrder = structuredClone(topEightSettings);
    wrongOrder.matchups[2]!.bracket = 'winners';
    expect(topEightMatchupsStateSchema.safeParse(wrongOrder).success).toBe(false);
    expect(topEightMatchupsStateSchema.safeParse({ ...topEightSettings, updatedAt: 'yesterday' }).success).toBe(false);
    expect(topEightMatchupsStateSchema.safeParse({ ...topEightSettings, stylingGameId: 'unknown-game' }).success).toBe(
      false
    );
    expect(
      topEightMatchupsStateSchema.safeParse({ ...topEightSettings, assetCatalogSlug: 'a'.repeat(101) }).success
    ).toBe(false);
    for (const player of [{ character: ' ' }, { characterAssetId: 'a'.repeat(256) }]) {
      const input = structuredClone(topEightSettings);
      Object.assign(input.matchups[0]!.players[0]!, player);
      expect(topEightMatchupsStateSchema.safeParse(input).success, JSON.stringify(player)).toBe(false);
    }

    const parsed = topEightMatchupsStateSchema.parse({ ...topEightSettings, tournamentName: '  Finals  ' });
    expect(parsed.tournamentName).toBe('Finals');
    expect(parsed.showBackground).toBe(true);
    expect(parsed.flipPlayerTwoPortraits).toBe(false);
  });
});
