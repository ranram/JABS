import { describe, expect, it } from 'vitest';
import { characterTeamSelection, maxCharactersForGame, playerCharacters, playerPortraitCharacters } from './characterTeams';

describe('character teams', () => {
  it('applies team limits and keeps legacy lead-character state compatible', () => {
    expect([maxCharactersForGame('2xko'), maxCharactersForGame('ultimate-marvel-vs-capcom-3'), maxCharactersForGame('marvel-tokon')]).toEqual([2, 3, 4]);
    expect(playerCharacters({ character: 'Ryu' })).toEqual(['Ryu']);
    expect(characterTeamSelection(['Ryu', 'Ken'])).toEqual({ character: 'Ryu', characters: ['Ryu', 'Ken'] });
    expect(playerPortraitCharacters({ character: 'Ryu', characters: ['Ryu', 'Ken', 'Chun-Li'] })).toEqual(['Ken', 'Chun-Li']);
  });
});
