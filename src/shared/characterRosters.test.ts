import { describe, expect, it } from 'vitest';
import { charactersForAssetCatalog, charactersForGame, isCharacterForGame, matchCharacterName } from './characterRosters';
import { gameProfiles } from './gameProfiles';

describe('character rosters', () => {
  it('keeps every reviewed roster nonempty, trimmed, and unique', () => {
    for (const gameId of Object.keys(gameProfiles) as Array<keyof typeof gameProfiles>) {
      const roster = charactersForGame(gameId);
      expect(roster.length, gameId).toBeGreaterThan(0);
      expect(roster.every((character) => character === character.trim() && character.length > 0)).toBe(true);
      expect(new Set(roster.map((character) => character.toLocaleLowerCase('en-US'))).size).toBe(roster.length);
    }
  });

  it('validates canonical names and normalizes reviewed external names', () => {
    expect(isCharacterForGame('tekken-8', 'Jin Kazama')).toBe(true);
    expect(isCharacterForGame('tekken-8', 'jin kazama')).toBe(false);
    expect(charactersForAssetCatalog('street-fighter-6')).toContain('Ryu');
    expect(charactersForAssetCatalog('samurai-shodown')).toEqual([]);
    expect(matchCharacterName('street-fighter-6', 'Chun Li')).toBe('Chun-Li');
    expect(matchCharacterName('tekken-8', 'NINA WILLIAMS')).toBe('Nina Williams');
    expect(matchCharacterName('street-fighter-6', 'Sheng Long')).toBeUndefined();
    expect(matchCharacterName('street-fighter-6', undefined)).toBeUndefined();
  });
});
