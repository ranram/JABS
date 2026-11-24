import { useEffect, useState } from 'react';
import { isImportedFont, type ImportedFont, type ImportedFontId, type ScoreboardFontId } from '@shared/fonts';
import { api } from '../../api';
import { useAssetRevision } from '../../hooks/useCatalogRevision';
import { bundledFonts } from './bundledFonts';
import { importedFontSizeAdjust } from './importedFontSize';

const fontLoads = new Map<ImportedFontId, Promise<FontFace>>();
let fontCatalog: { revision: number; pending: Promise<ImportedFont[]> } | undefined;

function loadCatalog(revision: number): Promise<ImportedFont[]> {
  if (fontCatalog?.revision === revision) return fontCatalog.pending;
  const pending = api.importedFonts().then(({ fonts }) => {
    if (fontCatalog?.pending === pending) {
      const listed = new Set(fonts.map(({ id }) => id));
      for (const [id, loaded] of fontLoads) {
        if (listed.has(id)) continue;
        fontLoads.delete(id);
        void loaded.then((face) => document.fonts.delete(face), () => {});
      }
    }
    return fonts;
  }).catch((error: unknown) => {
    if (fontCatalog?.pending === pending) fontCatalog = undefined;
    throw error;
  });
  fontCatalog = { revision, pending };
  return pending;
}

function loadImportedFont(id: ImportedFontId): Promise<FontFace> {
  const cached = fontLoads.get(id);
  if (cached) return cached;
  const family = `JABS ${id}`;
  const pending = api.importedFontBytes(id)
    .then((bytes) => {
      const descriptors: FontFaceDescriptors & { sizeAdjust?: string } = { sizeAdjust: importedFontSizeAdjust(bytes) };
      return new FontFace(family, bytes, descriptors).load();
    })
    .then((face) => { document.fonts.add(face); return face; })
    .catch((error: unknown) => {
      if (fontLoads.get(id) === pending) fontLoads.delete(id);
      throw error;
    });
  fontLoads.set(id, pending);
  return pending;
}

export function useScoreboardFontFamily(font?: ScoreboardFontId) {
  const [loaded, setLoaded] = useState<{ id: ImportedFontId; family: string }>();
  const assetRevision = useAssetRevision();
  useEffect(() => {
    if (!isImportedFont(font)) return;
    let active = true;
    void loadCatalog(assetRevision)
      .then((fonts) => active && fonts.some(({ id }) => id === font) ? loadImportedFont(font) : undefined)
      .then(
        (face) => { if (active) setLoaded(face ? { id: font, family: `"JABS ${font}"` } : undefined); },
        () => { if (active) setLoaded(undefined); }
      );
    return () => { active = false; };
  }, [font, assetRevision]);
  if (!font) return undefined;
  if (!isImportedFont(font)) return bundledFonts[font].family;
  return loaded?.id === font ? loaded.family : undefined;
}

export function useImportedFonts(enabled: boolean) {
  const [fonts, setFonts] = useState<ImportedFont[]>([]);
  const assetRevision = useAssetRevision();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadCatalog(assetRevision).then(
      (result) => { if (active) setFonts(result); },
      () => { if (active) setFonts([]); }
    );
    return () => { active = false; };
  }, [enabled, assetRevision]);
  return fonts;
}
