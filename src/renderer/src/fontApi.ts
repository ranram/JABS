import { importedFontSchema, importedFontsSchema, maxFontFileBytes, type ImportedFontId } from '@shared/fonts';
import type { createLocalApiTransport } from './localApiTransport';

export function createFontApi(
  request: ReturnType<typeof createLocalApiTransport>['request'],
  base: Promise<string>
) {
  return {
    importedFonts: () => request('/api/fonts', undefined, { decoder: importedFontsSchema }),
    importFont: (name: string, file: File) =>
      request(
        `/api/fonts?name=${encodeURIComponent(name)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file },
        { decoder: importedFontSchema }
      ),
    deleteImportedFont: (id: ImportedFontId) =>
      request<void>(`/api/fonts?fontId=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    importedFontBytes: async (id: ImportedFontId) => {
      const response = await fetch(`${await base}/assets/fonts/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error('Font unavailable.');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > maxFontFileBytes) throw new Error('Font unavailable.');
      return bytes;
    }
  };
}
