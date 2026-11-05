// @vitest-environment happy-dom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { stingerSettingsSchema, type StingerState } from '@shared/stingers';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { initializeI18n, i18n } from '../../i18n';
import { useStingerPlaybackActions } from './useStingerPlaybackActions';

const transport = vi.hoisted(() => ({ state: undefined as StingerState | undefined, play: vi.fn() }));
vi.mock('../../api', () => ({ api: { stingers: async () => transport.state, playStinger: transport.play } }));

it('distinguishes missing clips, prevents overlapping playback requests, and reports playback failures', async () => {
  await initializeI18n();
  const notice = vi.spyOn(notifications, 'show').mockImplementation(() => 'notice');
  transport.state = {
    readySources: 1,
    settings: stingerSettingsSchema.parse({
      perfect: {},
      winner: {},
      automaticWinner: false,
      mediaDelaySeconds: 0,
      videoLayer: 'background',
      updatedAt: 'now'
    })
  };
  const hook = await mountHook(useStingerPlaybackActions);
  try {
    expect(await hook.current('perfect')).toBe('unconfigured');
    expect(await hook.current('winner')).toBe('unconfigured');
    expect(transport.play).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
    transport.state.settings.perfect.video = { id: 'perfect.webm', name: 'Perfect' };
    const playback = deferred<StingerState>();
    transport.play.mockReturnValueOnce(playback.promise);
    const first = hook.current('perfect');
    await Promise.resolve();
    expect(await hook.current('perfect')).toBe('blocked');
    expect(transport.play).toHaveBeenCalledOnce();
    playback.resolve(transport.state);
    expect(await first).toBe('completed');
    transport.play.mockRejectedValueOnce(new Error('Playback failed.'));
    expect(await hook.current('perfect')).toBe('failed');
    expect(notice).toHaveBeenCalledOnce();
    await act(async () => {
      await i18n.changeLanguage('es-419');
    });
    transport.play.mockRejectedValueOnce(new Error('Activa la fuente de Stingers en OBS.'));
    expect(await hook.current('perfect')).toBe('failed');
    expect(notice).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Activa la fuente de Stingers en OBS.' })
    );
  } finally {
    await hook.unmount();
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
  }
});
