import { describe, expect, it } from 'vitest';
import { gameAssetCatalogSlug, isSafeGameAssetCatalogSlug } from './gameAssetCatalog';

describe('dynamic game asset catalogs', () => {
  it('derives safe stable slugs and rejects path segments', () => {
    expect(gameAssetCatalogSlug({ id: '123', name: 'Pokémon UNITE™' })).toBe('pokemon-unite');
    expect(gameAssetCatalogSlug({ id: '9876', name: '侍魂' })).toBe('startgg-game-9876');
    expect(isSafeGameAssetCatalogSlug('samurai-shodown')).toBe(true);
    expect(isSafeGameAssetCatalogSlug('../samurai-shodown')).toBe(false);
  });
});
