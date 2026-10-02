import { useEffect, useRef, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { appUpdater, type UpdateSupport } from '../../appUpdater';

type Phase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'installing' | 'installed' | 'restarting';
type Failure = 'support' | 'check' | 'install' | 'restart';

export function useAppUpdates() {
  const [support, setSupport] = useState<UpdateSupport>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<Failure>();
  const [release, setRelease] = useState<{ version: string; notes?: string }>();
  const [progress, setProgress] = useState<number>();
  const model = useRef({ mounted: false, busy: false, update: undefined as Update | undefined });

  useEffect(() => {
    const current = model.current;
    current.mounted = true;
    let active = true;
    void appUpdater
      .support()
      .then((value) => {
        if (active) setSupport(value);
      })
      .catch(() => {
        if (active) setFailure('support');
      });
    return () => {
      active = false;
      current.mounted = false;
      if (!current.busy) {
        void current.update?.close().catch(() => undefined);
        current.update = undefined;
      }
    };
  }, []);

  async function checkForUpdates() {
    const current = model.current;
    if (current.busy || support?.availability !== 'available') return;
    current.busy = true;
    setFailure(undefined);
    setPhase('checking');
    const previous = current.update;
    current.update = undefined;
    setRelease(undefined);
    try {
      await previous?.close();
      const update = await appUpdater.check();
      if (!current.mounted) {
        await update?.close();
        return;
      }
      current.update = update ?? undefined;
      setRelease(update ? { version: update.version, notes: update.body } : undefined);
      setPhase(update ? 'available' : 'current');
    } catch {
      if (current.mounted) {
        setFailure('check');
        setPhase('idle');
      }
    } finally {
      current.busy = false;
    }
  }

  async function installUpdate(blocked: boolean) {
    const current = model.current;
    const update = current.update;
    if (current.busy || blocked || !update) return;
    current.busy = true;
    setFailure(undefined);
    setPhase('downloading');
    setProgress(undefined);
    let downloaded = 0;
    let total: number | undefined;
    try {
      await appUpdater.install(update, (event) => {
        if (!current.mounted) return;
        if (event.event === 'Started') total = event.data.contentLength;
        if (event.event === 'Progress') downloaded += event.data.chunkLength;
        if (event.event === 'Finished') setPhase('installing');
        else if (total) setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
      });
      // Windows exits through the installer. macOS and AppImage installs need a restart.
      if (current.mounted) setPhase('installed');
      current.update = undefined;
      await update.close().catch(() => undefined);
    } catch {
      if (current.mounted) {
        setFailure('install');
        setPhase('available');
      }
    } finally {
      current.busy = false;
      if (!current.mounted) {
        void current.update?.close().catch(() => undefined);
        current.update = undefined;
      }
    }
    if (current.mounted && current.update === undefined) await restartApp(blocked);
  }

  async function restartApp(blocked: boolean) {
    const current = model.current;
    if (current.busy || blocked) return;
    current.busy = true;
    setFailure(undefined);
    setPhase('restarting');
    try {
      await appUpdater.restart();
    } catch {
      if (current.mounted) {
        setFailure('restart');
        setPhase('installed');
      }
    } finally {
      current.busy = false;
    }
  }

  return { support, phase, failure, release, progress, checkForUpdates, installUpdate, restartApp };
}
