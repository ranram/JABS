import { describe, expect, it } from 'vitest';
import { normalizeEventSlug, normalizeTournamentSlug } from './startgg';

describe('start.gg input', () => {
  it('normalizes supported tournament inputs and rejects unsafe ones', () => {
    const valid = [
      ['genesis-x', 'genesis-x'],
      [' tournament/genesis-x ', 'genesis-x'],
      ['https://start.gg/tournament/genesis-x/events', 'genesis-x'],
      ['https://www.start.gg/tournament/genesis-x/event/melee-singles', 'genesis-x']
    ] as const;
    for (const [input, expected] of valid) {
      expect(normalizeTournamentSlug(input), input).toBe(expected);
    }
    for (const input of ['', 'https://example.com/tournament/genesis-x', 'http://start.gg/tournament/genesis-x', 'https://start.gg/tournament/', 'event/melee-singles']) {
      expect(() => normalizeTournamentSlug(input), input).toThrow();
    }
  });

  it('normalizes supported event inputs and rejects unsafe ones', () => {
    const valid = [
      ['https://start.gg/tournament/genesis-x/event/ultimate-singles', 'tournament/genesis-x/event/ultimate-singles'],
      ['https://www.start.gg/tournament/genesis-x/event/ultimate-singles/standings', 'tournament/genesis-x/event/ultimate-singles'],
      ['tournament/genesis-x/event/ultimate-singles', 'tournament/genesis-x/event/ultimate-singles']
    ] as const;
    for (const [input, expected] of valid) {
      expect(normalizeEventSlug(input), input).toBe(expected);
    }
    for (const input of ['genesis-x', 'https://start.gg/tournament/genesis-x', 'https://example.com/tournament/genesis-x/event/ultimate-singles', 'http://start.gg/tournament/genesis-x/event/ultimate-singles']) {
      expect(() => normalizeEventSlug(input), input).toThrow();
    }
  });
});
