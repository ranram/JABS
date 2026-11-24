import { z } from 'zod';

export const bundledFontIds = [
  'anton',
  'archivo-black',
  'barlow-condensed',
  'bebas-neue',
  'bungee-shade',
  'inter',
  'lato',
  'montserrat',
  'oswald',
  'oxanium',
  'titan-one'
] as const;

export const bundledFontSchema = z.enum(bundledFontIds);
export type BundledFontId = (typeof bundledFontIds)[number];
export type ImportedFontId = `file-${string}`;
export type ScoreboardFontId = BundledFontId | ImportedFontId;

const importedFontId = /^file-[0-9a-f]{1,32}$/;
const importedFontIdSchema = z.string().regex(importedFontId).transform((id) => id as ImportedFontId);
export const scoreboardFontSchema = z.union([bundledFontSchema, importedFontIdSchema]);
export const importedFontSchema = z.object({ id: importedFontIdSchema, name: z.string().min(1).max(100) });
export const importedFontsSchema = z.object({ fonts: z.array(importedFontSchema) });
export type ImportedFont = z.infer<typeof importedFontSchema>;
export const maxFontFileBytes = 20 * 1024 * 1024;

export function isImportedFont(id: string | undefined): id is ImportedFontId {
  return id !== undefined && importedFontId.test(id);
}
