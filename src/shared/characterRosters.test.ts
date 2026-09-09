import { describe, expect, it } from 'vitest';
import { charactersForAssetCatalog, charactersForGame, isCharacterForGame, matchCharacterName } from './characterRosters';
import { gameProfiles } from './gameProfiles';
import { generatedCharacterAliases } from './generatedCharacterAliases';

describe('character rosters', () => {
  it('keeps every reviewed roster nonempty, trimmed, and unique', () => {
    for (const gameId of Object.keys(gameProfiles) as Array<keyof typeof gameProfiles>) {
      const roster = charactersForGame(gameId);
      expect(roster.length, gameId).toBeGreaterThan(0);
      expect(roster.every((character) => character === character.trim() && character.length > 0)).toBe(true);
      expect(new Set(roster.map((character) => character.toLocaleLowerCase('en-US'))).size).toBe(roster.length);
      for (const [alias, canonical] of Object.entries(generatedCharacterAliases[gameId])) {
        expect(matchCharacterName(gameId, alias), `${gameId}: ${alias}`).toBe(canonical);
        expect(roster).toContain(canonical);
      }
    }
    expect(isCharacterForGame('tekken-8', 'Jin Kazama')).toBe(true);
    expect(isCharacterForGame('tekken-8', 'jin kazama')).toBe(false);
    expect(charactersForAssetCatalog('street-fighter-6')).toContain('Ryu');
    expect(charactersForAssetCatalog('samurai-shodown')).toEqual([]);
    expect(matchCharacterName('street-fighter-6', 'Chun Li')).toBe('Chun-Li');
    expect(matchCharacterName('tekken-8', 'NINA WILLIAMS')).toBe('Nina Williams');
    expect(charactersForGame('super-smash-bros-ultimate')).toContain('Pyra and Mythra');
    expect(charactersForGame('super-smash-bros-ultimate')).not.toContain('Pyra');
    expect(charactersForGame('super-smash-bros-ultimate')).not.toContain('Mythra');
    expect(matchCharacterName('street-fighter-6', 'Sheng Long')).toBeUndefined();
    expect(matchCharacterName('street-fighter-6', undefined)).toBeUndefined();
    expect(matchCharacterName('street-fighter-6', 'AKI')).toBe('A.K.I.');
    expect(matchCharacterName('street-fighter-6', 'Bison')).toBe('M. Bison');
    expect(matchCharacterName('street-fighter-6', 'Viper')).toBe('C. Viper');
    expect(matchCharacterName('street-fighter-6', 'Vega')).toBeUndefined();
    expect(matchCharacterName('street-fighter-6', 'Koopa')).toBeUndefined();
    expect(matchCharacterName('super-smash-bros-ultimate', 'Yusha')).toBe('Hero');
    expect(matchCharacterName('super-smash-bros-ultimate', 'Rosetta and Chico')).toBe('Rosalina and Luma');
    expect(matchCharacterName('street-fighter-6', 'constructor')).toBeUndefined();
  });
});
