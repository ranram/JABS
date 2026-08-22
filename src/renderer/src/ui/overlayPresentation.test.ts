import { describe, expect, it } from 'vitest';
import {
  announcementSurfaceFromOverlayPath,
  gameIdFromOverlayPath,
  isCommentatorOverlayPath,
  isVersusOverlayPath,
  resolveOverlayPresentation
} from './overlayPresentation';

describe('overlay presentation routing', () => {
  it('routes fixed and active game overlays while rejecting malformed paths', () => {
    expect(gameIdFromOverlayPath('/overlay/tekken-8/main')).toBe('tekken-8');
    expect(gameIdFromOverlayPath('/overlay/avatar-fighters/main/')).toBe('avatar-legends');
    expect(gameIdFromOverlayPath('/overlay/unknown/main')).toBeUndefined();
    expect(gameIdFromOverlayPath('/overlay/%E0%A4%A/main')).toBeUndefined();
    expect(resolveOverlayPresentation('/overlay/marvel-tokon/main', 'tekken-8')).toEqual({ gameId: 'marvel-tokon', template: 'tokon-assemble' });
    expect(resolveOverlayPresentation('/overlay/active/main', 'guilty-gear-strive')).toEqual({ gameId: 'guilty-gear-strive', template: 'strive-daredevil' });
    expect(resolveOverlayPresentation('/overlay/not-a-game/main', 'tekken-8')).toBeUndefined();
  });

  it('recognizes only the dedicated result, commentator, and versus routes', () => {
    expect(announcementSurfaceFromOverlayPath('/overlay/active/winner')).toBe('result');
    expect(announcementSurfaceFromOverlayPath('/overlay/active/champion/')).toBe('result');
    expect(announcementSurfaceFromOverlayPath('/overlay/tekken-8/winner')).toBeUndefined();
    expect(isCommentatorOverlayPath('/overlay/commentators/')).toBe(true);
    expect(isCommentatorOverlayPath('/overlay/active/commentators')).toBe(false);
    expect(isVersusOverlayPath('/overlay/active/versus/')).toBe(true);
    expect(isVersusOverlayPath('/overlay/tekken-8/versus')).toBe(false);
  });
});
