import { invoke } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { isTauriRuntime } from './desktopRuntime';

export type UpdateSupport = {
  version: string;
  availability: 'available' | 'development' | 'unconfigured' | 'package-manager';
};

export const appUpdater = {
  async support(): Promise<UpdateSupport | undefined> {
    return isTauriRuntime() ? invoke<UpdateSupport>('get_update_support') : undefined;
  },
  check(): Promise<Update | null> {
    return check({ timeout: 15_000 });
  },
  install(update: Update, onProgress: (event: DownloadEvent) => void): Promise<void> {
    return update.downloadAndInstall(onProgress, { timeout: 120_000 });
  },
  restart(): Promise<void> {
    return invoke('restart_app');
  }
};
