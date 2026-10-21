import { describe, expect, it } from 'vitest';
import { localOverlayUrl, type LocalHandoffUrl } from '../desktopRuntime';
import { statsPlayerFromSearch } from '@shared/playerStats';
import {
  announcementSurfaceFromOverlayPath,
  gameIdFromOverlayPath,
  isCommentatorOverlayPath,
  isVersusOverlayPath,
  isPlayerStatsOverlayPath,
  isTopEightMatchupsOverlayPath,
  isBracketOverlayPath,
  resolveOverlayPresentation
} from './overlayPresentation';

describe('overlay presentation routing', () => {
  it('routes copied OBS URLs and fixed game overlays while rejecting malformed paths and non-loopback hosts', () => {
    expect(gameIdFromOverlayPath('/overlay/tekken-8/main')).toBe('tekken-8');
    expect(gameIdFromOverlayPath('/overlay/avatar-fighters/main/')).toBe('avatar-legends');
    expect(gameIdFromOverlayPath('/overlay/unknown/main')).toBeUndefined();
    expect(gameIdFromOverlayPath('/overlay/%E0%A4%A/main')).toBeUndefined();
    expect(resolveOverlayPresentation('/overlay/marvel-tokon/main', 'tekken-8')).toEqual({
      gameId: 'marvel-tokon',
      template: 'tokon-assemble'
    });
    expect(resolveOverlayPresentation('/overlay/active/main', 'guilty-gear-strive')).toEqual({
      gameId: 'guilty-gear-strive',
      template: 'strive-daredevil'
    });
    expect(resolveOverlayPresentation('/overlay/not-a-game/main', 'tekken-8')).toBeUndefined();
    const surfaces: Record<LocalHandoffUrl, (path: string) => unknown> = {
      score: (path) => resolveOverlayPresentation(path, 'tekken-8'),
      winner: announcementSurfaceFromOverlayPath,
      champion: announcementSurfaceFromOverlayPath,
      commentators: isCommentatorOverlayPath,
      versus: isVersusOverlayPath,
      'stats-player-1': isPlayerStatsOverlayPath,
      'stats-player-2': isPlayerStatsOverlayPath,
      'top-eight-matchups': isTopEightMatchupsOverlayPath,
      bracket: isBracketOverlayPath,
      stingers: (path) => path === '/overlay/stingers'
    };
    for (const [kind, resolve] of Object.entries(surfaces)) {
      const url = new URL(localOverlayUrl('http://127.0.0.1:4279', kind as LocalHandoffUrl));
      expect(url.origin).toBe('http://127.0.0.1:4279');
      expect(resolve(url.pathname), kind).toBeTruthy();
      if (kind.startsWith('stats-player-')) expect(statsPlayerFromSearch(url.search)).toBe(Number(kind.slice(-1)));
    }
    for (const base of ['https://127.0.0.1:4279', 'http://localhost:4279', 'http://127.0.0.1']) {
      expect(() => localOverlayUrl(base, 'score')).toThrow();
    }
    expect(announcementSurfaceFromOverlayPath('/overlay/active/winner')).toBe('result');
    expect(announcementSurfaceFromOverlayPath('/overlay/active/champion/')).toBe('result');
    expect(announcementSurfaceFromOverlayPath('/overlay/tekken-8/winner')).toBeUndefined();
    expect(isCommentatorOverlayPath('/overlay/commentators/')).toBe(true);
    expect(isCommentatorOverlayPath('/overlay/active/commentators')).toBe(false);
    expect(isVersusOverlayPath('/overlay/active/versus/')).toBe(true);
    expect(isVersusOverlayPath('/overlay/tekken-8/versus')).toBe(false);
    expect(statsPlayerFromSearch('')).toBe(1);
    for (const search of ['?player=0', '?player=3', '?player=one', '?player=1&player=2']) {
      expect(statsPlayerFromSearch(search)).toBeUndefined();
    }
  });
});
