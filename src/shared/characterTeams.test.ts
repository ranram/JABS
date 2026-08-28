import { describe, expect, it } from 'vitest';
import { characterTeamSelection, maxCharactersForGame, playerCharacters, playerPortraitCharacters } from './characterTeams';
import { characterOutfitOptions, selectedCharacterAssetId } from './characterAssets';

describe('character teams', () => {
  it('applies team limits and keeps legacy lead-character state compatible', () => {
    expect([maxCharactersForGame('2xko'), maxCharactersForGame('ultimate-marvel-vs-capcom-3'), maxCharactersForGame('marvel-tokon')]).toEqual([2, 3, 4]);
    expect(playerCharacters({ character: 'Ryu' })).toEqual(['Ryu']);
    expect(characterTeamSelection(['Ryu', 'Ken'])).toEqual({
      character: 'Ryu',
      characters: ['Ryu', 'Ken'],
      characterAssetId: undefined
    });
    expect(characterTeamSelection([])).toEqual({
      character: undefined,
      characters: undefined,
      characterAssetId: undefined
    });
    expect(characterTeamSelection(['Ryu'], {
      character: 'Ryu',
      characterAssetId: 'Ryu (3).png'
    }).characterAssetId).toBe('Ryu (3).png');
    const assets = [{
      character: 'Ryu',
      assetId: 'Ryu (1).png',
      variants: [
        { label: '1', assetId: 'Ryu (1).png' },
        { label: '2', assetId: 'Ryu (2).png' }
      ]
    }];
    expect(characterOutfitOptions({ character: 'Ryu' }, assets)).toHaveLength(2);
    expect(selectedCharacterAssetId({
      character: 'Ryu',
      characterAssetId: 'Ryu (2).png'
    }, assets)).toBe('Ryu (2).png');
    expect(playerPortraitCharacters({ character: 'Ryu', characters: ['Ryu', 'Ken', 'Chun-Li'] })).toEqual(['Ken', 'Chun-Li']);
  });
});
