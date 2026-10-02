import { describe, expect, it } from 'vitest';
import { commentatorStateSchema } from './commentators';
import { topEightMatchupsStateSchema } from './topEightMatchups';

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
  it('preserves logo visibility when migrating and saving overlay settings', () => {
    const common = {
      stylingGameId: 'street-fighter-6',
      tournamentName: 'Tournament',
      logoAssetId: 'logo.png',
      updatedAt: '2026-09-08T00:00:00Z'
    };
    const snapshots = [
      commentatorStateSchema.parse({
        ...common,
        presentation: 'hidden',
        commentators: [
          { name: 'One', handle: '' },
          { name: 'Two', handle: '' }
        ]
      }),
      topEightMatchupsStateSchema.parse({ ...topEightSettings, ...common })
    ];
    for (const [index, schema] of [commentatorStateSchema, topEightMatchupsStateSchema].entries()) {
      expect(snapshots[index]?.showTournamentLogo).toBe(true);
      const restored = schema.parse(JSON.parse(JSON.stringify({ ...snapshots[index], showTournamentLogo: false })));
      expect(restored.showTournamentLogo).toBe(false);
      expect(restored.logoAssetId).toBe('logo.png');
    }
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
