import { invokeNative } from './nativeCommand';
import type { TokenStatus } from '@shared/models';

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function isTauriRuntime(): boolean {
  return Boolean((window as TauriWindow).__TAURI_INTERNALS__);
}

export async function getDesktopApiPort(): Promise<number | undefined> {
  if (isTauriRuntime()) {
    return invokeNative<number>('get_api_port');
  }
  return undefined;
}

export function openNativeExternalUrl(url: string): Promise<void> {
  return invokeNative<void>('open_external_url', { url });
}

export function getNativeTokenStatus(): Promise<TokenStatus> {
  return invokeNative<TokenStatus>('get_token_status');
}

export function setNativeStartggToken(token: string, sessionOnly: boolean): Promise<TokenStatus> {
  return invokeNative<TokenStatus>(sessionOnly ? 'set_session_startgg_token' : 'set_startgg_token', { token });
}

export function clearNativeStartggToken(): Promise<TokenStatus> {
  return invokeNative<TokenStatus>('clear_startgg_token');
}

export type MediaDirectories = {
  assetsRoot?: string;
  gameAssets: string;
  players: string;
  playerHeadshots?: string;
  sponsors: string;
  tourneyLogos: string;
  moderationAllowlist: string;
};

export type MediaDirectoryKind =
  'assets' | 'game-assets' | 'players' | 'player_headshots' | 'sponsors' | 'tourney-logos';

export function nativeMediaDirectory(
  directories: MediaDirectories | undefined,
  kind: MediaDirectoryKind
): string | undefined {
  if (!directories) return undefined;
  switch (kind) {
    case 'assets':
      return directories.assetsRoot;
    case 'game-assets':
      return directories.gameAssets;
    case 'players':
      return directories.players;
    case 'player_headshots':
      return directories.playerHeadshots;
    case 'sponsors':
      return directories.sponsors;
    case 'tourney-logos':
      return directories.tourneyLogos;
  }
}

/**
 * Resolved user-media catalog locations, for display only. Outside the Tauri
 * desktop shell (plain-browser development) the native locations do not
 * exist, so callers fall back to the repository-relative hint.
 */
export async function getNativeMediaDirectories(): Promise<MediaDirectories | undefined> {
  if (!isTauriRuntime()) return undefined;
  return invokeNative<MediaDirectories>('get_media_directories');
}

export async function openNativeMediaDirectory(kind: MediaDirectoryKind, subpath?: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invokeNative<void>('open_media_directory', { kind, subpath });
}

export type ModerationAllowlistStatus = {
  entryCount: number;
};

export function getNativeModerationAllowlist(): Promise<string> {
  return invokeNative<string>('get_moderation_allowlist');
}

export function saveNativeModerationAllowlist(contents: string): Promise<ModerationAllowlistStatus> {
  return invokeNative<ModerationAllowlistStatus>('save_moderation_allowlist', { contents });
}

export function reloadNativeModerationAllowlist(): Promise<ModerationAllowlistStatus> {
  return invokeNative<ModerationAllowlistStatus>('reload_moderation_allowlist');
}

export type LocalHandoffUrl =
  | 'score'
  | 'versus'
  | 'stats-player-1'
  | 'stats-player-2'
  | 'winner'
  | 'champion'
  | 'top-eight-matchups'
  | 'commentators'
  | 'bracket'
  | 'stingers';

const overlayPaths: Record<LocalHandoffUrl, string> = {
  score: '/overlay/active/main',
  versus: '/overlay/active/versus',
  'stats-player-1': '/overlay/active/stats?player=1',
  'stats-player-2': '/overlay/active/stats?player=2',
  winner: '/overlay/active/winner',
  champion: '/overlay/active/champion',
  'top-eight-matchups': '/overlay/active/top-eight-matchups',
  commentators: '/overlay/commentators',
  bracket: '/overlay/active/bracket',
  stingers: '/overlay/stingers'
};

export function localOverlayUrl(apiBase: string, kind: LocalHandoffUrl): string {
  const base = new URL(apiBase);
  const port = Number(base.port);
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error('JABS cannot copy an OBS URL with an invalid local API address.');
  }
  return new URL(overlayPaths[kind], base).toString();
}

export async function copyOverlayUrl(apiBase: string, kind: LocalHandoffUrl): Promise<void> {
  await copyTextToClipboard(localOverlayUrl(apiBase, kind));
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some Linux WebKit permission configurations expose the API but deny the write.
    }
  }

  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('JABS could not copy the OBS URL.');
}
