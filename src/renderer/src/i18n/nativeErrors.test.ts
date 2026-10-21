// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { initializeI18n, i18n } from './index';
import { localizedNativeError } from './nativeErrors';
import { localizedStartggError } from './startggErrors';
import { invokeNative } from '../nativeCommand';
import { api } from '../api';
import { createTestOverlayState } from '@shared/testFixtures';

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }));
afterEach(async () => {
  vi.unstubAllGlobals();
  bridge.invoke.mockReset();
  await i18n.changeLanguage('en');
});

it('localizes native HTTP and desktop failures with field details and keeps English diagnostics out of Spanish controls', async () => {
  await initializeI18n();
  await i18n.changeLanguage('es-419');
  const blocked =
    'Blocked offensive text in Player one pronouns, Player two sponsor. Remove it before saving stream state.';
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: blocked }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        })
    )
  );
  await expect(api.updateSelectedSet(createTestOverlayState().selectedSet)).rejects.toThrow(
    'Se detectó texto ofensivo en Pronombres del jugador 1, Patrocinador del jugador 2.'
  );
  bridge.invoke.mockRejectedValueOnce('The start.gg token format is invalid.');
  await expect(invokeNative('set_startgg_token', { token: 'test-only' })).rejects.toThrow(
    'El formato del token de start.gg no es válido.'
  );
  expect(localizedNativeError('This game supports at most 3 selected characters per player.')).toBe(
    'Este juego permite seleccionar hasta 3 personajes por jugador.'
  );
  expect(localizedNativeError('topEightMatchups.invalidPlayerName')).toBe(
    i18n.t('operator:topEightMatchups.invalidPlayerName')
  );
  expect(localizedNativeError('moderation.lineTooLong|7')).toContain('7');
  expect(localizedNativeError('moderation.lineTooLong|7')).not.toContain('moderation.');
  expect(localizedNativeError('moderation.protectedEntry|3')).toBe(
    'La línea 3 contiene un término protegido y no se puede permitir.'
  );
  expect(localizedNativeError('unmapped operating-system detail')).toBe(i18n.t('errors:nativeFailure'));
  expect(localizedStartggError({ code: '__proto__', error: 'unknown failure' }, 'Error HTTP 422')).toBe(
    'Error HTTP 422'
  );
  expect(localizedNativeError('These settings changed elsewhere. Reload them before saving again.')).toContain(
    'Recárgalos'
  );
  await i18n.changeLanguage('en');
  expect(localizedNativeError('moderation.protectedEntry|3')).toBe(
    'Line 3 contains a protected term and cannot be allowed.'
  );
  expect(localizedNativeError(blocked)).toBe(blocked);
});
