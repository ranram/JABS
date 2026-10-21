import { describe, expect, it } from 'vitest';
import {
  bestOfOptionsForGame,
  defaultBestOfForGame,
  gameIdForStartggVideogame,
  resolveStartggGameProfileId,
  scoreLimitForBestOf
} from './gameProfiles';

describe('game profiles', () => {
  it('maps reviewed start.gg titles without fuzzy-matching similar games', () => {
    const recognized = [
      ['Street Fighter™ 6', 'street-fighter-6'],
      ['TEKKEN™8', 'tekken-8'],
      ['Avatar Legends: The Fighting Game', 'avatar-legends'],
      ['MARVEL TōKON: Fighting Souls', 'marvel-tokon'],
      ['Guilty Gear: Strive', 'guilty-gear-strive'],
      ['2XKO', '2xko'],
      ['BlazBlue: Central Fiction', 'blazblue-centralfiction'],
      ['FATAL FURY: City of the Wolves', 'fatal-fury-city-of-the-wolves'],
      ['Granblue Fantasy Versus: Rising', 'granblue-fantasy-versus-rising'],
      ['THE KING OF FIGHTERS XV', 'king-of-fighters-xv'],
      ['MELTY BLOOD: TYPE LUMINA', 'melty-blood-type-lumina'],
      ['Mortal Kombat 1', 'mortal-kombat-1'],
      ['Ultimate Marvel vs. Capcom 3', 'ultimate-marvel-vs-capcom-3'],
      ['Super Smash Bros. Ultimate', 'super-smash-bros-ultimate'],
      ['UNDER NIGHT IN-BIRTH II Sys:Celes', 'under-night-in-birth-ii-sys-celes']
    ] as const;
    for (const [name, expected] of recognized) {
      expect(gameIdForStartggVideogame({ id: 'game-id', name }), name).toBe(expected);
    }
    for (const name of ['Street Fighter 6 Teams', 'Tekken 7', 'Guilty Gear Xrd REV 2']) {
      expect(gameIdForStartggVideogame({ id: 'game-id', name }), name).toBeUndefined();
    }
    const vampireSavior = { id: '582', name: 'Vampire Savior: The Lord of Vampire' };
    expect(gameIdForStartggVideogame(vampireSavior)).toBeUndefined();
    expect(resolveStartggGameProfileId(vampireSavior)).toBe('street-fighter-6');
    expect(resolveStartggGameProfileId(vampireSavior, 'guilty-gear-strive')).toBe('guilty-gear-strive');
    expect(resolveStartggGameProfileId(vampireSavior, '')).toBe('street-fighter-6');
    expect(resolveStartggGameProfileId({ id: '1', name: 'Tekken 8' }, 'street-fighter-6')).toBe('tekken-8');
  });

  it('derives score limits and applies phase and game format rules', () => {
    expect(bestOfOptionsForGame('street-fighter-6')).toEqual([3, 5]);
    expect(scoreLimitForBestOf('street-fighter-6', 3)).toBe(2);
    expect(scoreLimitForBestOf('street-fighter-6', 5)).toBe(3);
    expect(scoreLimitForBestOf('street-fighter-6', 99)).toBe(3);
    expect(defaultBestOfForGame('street-fighter-6', { phase: 'Pools' })).toBe(3);
    expect(defaultBestOfForGame('street-fighter-6', { phase: 'Top 8' })).toBe(5);
    expect(defaultBestOfForGame('guilty-gear-strive', { phase: 'Pools' })).toBe(5);
    expect(defaultBestOfForGame('2xko', { phase: 'Top 8', round: 'Winners Semifinal' })).toBe(3);
    expect(defaultBestOfForGame('2xko', { phase: 'Top 8', round: 'Winners Final' })).toBe(5);
  });
});
