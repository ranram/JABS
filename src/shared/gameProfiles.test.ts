import { describe, expect, it } from 'vitest';
import {
  bestOfOptionsForGame,
  defaultBestOfForGame,
  defaultGameId,
  gameIdForStartggVideogame,
  gameProfiles,
  resolveGameProfile,
  scoreLimitForBestOf
} from './gameProfiles';

describe('game profiles', () => {
  it('resolves current, legacy, and unknown profile IDs', () => {
    expect(resolveGameProfile('tekken-8').label).toBe('Tekken 8');
    expect(resolveGameProfile('avatar-fighters')).toMatchObject({ id: 'avatar-legends', shortLabel: 'AL' });
    expect(resolveGameProfile('unknown-game').id).toBe(defaultGameId);
  });

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
  });

  it('derives score limits and applies phase and game format rules', () => {
    expect(bestOfOptionsForGame('street-fighter-6')).toEqual([3, 5]);
    expect(scoreLimitForBestOf('street-fighter-6', 3)).toBe(2);
    expect(scoreLimitForBestOf('street-fighter-6', 99)).toBe(3);
    expect(defaultBestOfForGame('street-fighter-6', { phase: 'Pools' })).toBe(3);
    expect(defaultBestOfForGame('street-fighter-6', { phase: 'Top 8' })).toBe(5);
    expect(defaultBestOfForGame('guilty-gear-strive', { phase: 'Pools' })).toBe(5);
    expect(defaultBestOfForGame('2xko', { phase: 'Top 8', round: 'Winners Semifinal' })).toBe(3);
    expect(defaultBestOfForGame('2xko', { phase: 'Top 8', round: 'Winners Final' })).toBe(5);
  });

  it('keeps overlay templates unique and player plates inside the HUD safe area', () => {
    const templates = Object.values(gameProfiles).map((profile) => profile.overlay.template);
    expect(new Set(templates).size).toBe(templates.length);
    for (const profile of Object.values(gameProfiles)) {
      const safeZone = profile.overlay.hudSafeZone;
      const playerPlateWidth = (1920 - safeZone.sidePadding * 2 - safeZone.centerWidth - safeZone.gap * 2) / 2;
      expect(safeZone.top, profile.id).toBeGreaterThanOrEqual(0);
      expect(safeZone.bottom, profile.id).toBeLessThanOrEqual(76);
      expect(playerPlateWidth, profile.id).toBeGreaterThanOrEqual(300);
    }
  });

  it('keeps lower rails and logos inside the broadcast-safe strip', () => {
    for (const profile of Object.values(gameProfiles)) {
      const safeZone = profile.overlay.broadcastSafeZone;
      expect(safeZone.height, profile.id).toBeGreaterThanOrEqual(18);
      expect(safeZone.bottom + safeZone.height, profile.id).toBeLessThanOrEqual(32);
      expect(safeZone.railWidth, profile.id).toBeGreaterThanOrEqual(420);
      expect(safeZone.railWidth, profile.id).toBeLessThanOrEqual(560);
      expect(safeZone.logoHeight, profile.id).toBeLessThanOrEqual(safeZone.logoAnchor === 'upper-center' ? 104 : 72);
    }
  });
});
