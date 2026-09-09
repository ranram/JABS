import { describe, expect, it } from 'vitest';
import { commentatorStateSchema } from './commentators';
import { topEightMatchupsStateSchema } from './topEightMatchups';

describe('broadcast composition contracts', () => {
  it('preserves logo visibility when migrating and saving overlay settings', () => {
    const common = { stylingGameId: 'street-fighter-6', tournamentName: 'Tournament', logoAssetId: 'logo.png', updatedAt: '2026-09-08T00:00:00Z' };
    const snapshots = [
      commentatorStateSchema.parse({ ...common, presentation: 'hidden', commentators: [{ name: 'One', handle: '' }, { name: 'Two', handle: '' }] }),
      topEightMatchupsStateSchema.parse({ ...common, assetCatalogSlug: 'street-fighter-6', matchups: Array.from({ length: 4 }, () => ({ bracket: 'winners', players: [{ name: 'One' }, { name: 'Two' }] })) })
    ];
    for (const [index, schema] of [commentatorStateSchema, topEightMatchupsStateSchema].entries()) {
      expect(snapshots[index]?.showTournamentLogo).toBe(true);
      const restored = schema.parse(JSON.parse(JSON.stringify({ ...snapshots[index], showTournamentLogo: false })));
      expect(restored.showTournamentLogo).toBe(false);
      expect(restored.logoAssetId).toBe('logo.png');
    }
  });
});
