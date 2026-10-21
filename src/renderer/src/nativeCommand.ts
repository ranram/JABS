import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import { localizedNativeError } from './i18n/nativeErrors';
import { diagnosticArea, recordDiagnostic } from './diagnostics';

export async function invokeNative<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    recordDiagnostic('native-command-failed', { area: diagnosticArea(command) });
    throw new Error(localizedNativeError(error));
  }
}
