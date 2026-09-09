import { describe, expect, it } from 'vitest';
import { localOverlayUrl, type LocalHandoffUrl } from './desktopRuntime';

describe('local overlay URLs', () => {
  it('maps every copy-menu choice to its documented OBS route', () => {
    const expected: Record<LocalHandoffUrl, string> = {
      score: '/overlay/active/main',
      versus: '/overlay/active/versus',
      winner: '/overlay/active/winner',
      champion: '/overlay/active/champion',
      'top-eight-matchups': '/overlay/active/top-eight-matchups',
      commentators: '/overlay/commentators'
    };

    for (const [kind, path] of Object.entries(expected)) {
      expect(localOverlayUrl('http://127.0.0.1:4279', kind as LocalHandoffUrl))
        .toBe(`http://127.0.0.1:4279${path}`);
    }
    expect(() => localOverlayUrl('https://127.0.0.1:4279', 'score')).toThrow();
    expect(() => localOverlayUrl('http://localhost:4279', 'score')).toThrow();
    expect(() => localOverlayUrl('http://127.0.0.1', 'score')).toThrow();
  });
});
