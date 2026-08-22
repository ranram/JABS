import { describe, expect, it } from 'vitest';
import { generatorGameContext } from './generatorGameContext';

describe('generator game context', () => {
  it('uses supported event profiles and clears stale identity for unsupported events', () => {
    expect(generatorGameContext({ selectedEventId: 'sf6', selectedEvent: { id: 'sf6', name: 'Singles', videogame: { id: '1', name: 'Street Fighter 6' } }, detectedGameId: 'street-fighter-6', selectionGameId: '', activeSet: undefined })).toEqual({ gameId: 'street-fighter-6', gameName: 'Street Fighter 6', assetCatalogSlug: 'street-fighter-6' });
    expect(generatorGameContext({ selectedEventId: 'other', selectedEvent: { id: 'other', name: 'Singles', videogame: { id: '2', name: 'Invincible VS' } }, selectionGameId: '', activeSet: { displayName: 'Old set', gameId: 'street-fighter-6', bestOf: 3, playerOne: { entrantId: 'one', name: 'One', score: 0 }, playerTwo: { entrantId: 'two', name: 'Two', score: 0 }, updatedAt: '2026-08-14T00:00:00Z' } })).toMatchObject({ gameId: undefined, gameName: 'Invincible VS', assetCatalogSlug: 'invincible-vs' });
  });
});
