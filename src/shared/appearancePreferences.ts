import { utf16AtMost } from './schemaText';
import { z } from 'zod';
import { bundledFontSchema } from './fonts';

const label = z
  .string()
  .refine(utf16AtMost(100))
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const appearanceSchema = z
  .object({
    winnersLabel: label.optional(),
    losersLabel: label.optional(),
    colorOverride: z.boolean().default(false),
    primaryColor: color.default('#f7b733'),
    secondaryColor: color.default('#ff554d'),
    textSize: z.enum(['default', 'large']).default('default'),
    broadcastLanguage: z.enum(['follow', 'en', 'es-419']).default('follow'),
    entranceAnimations: z.boolean().default(true)
  })
  .strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance: Appearance = appearanceSchema.parse({});
const appearanceKeys = Object.keys(appearanceSchema.shape) as Array<keyof Appearance>;
export function sameAppearance(left: Appearance, right: Appearance): boolean {
  return appearanceKeys.every((key) => left[key] === right[key]);
}
export const appearancePresetSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
    name: label.refine((value) => value.trim().length > 0),
    appearance: appearanceSchema
  })
  .strict();
export const appearancePreferencesSchema = z
  .object({
    scoreboardFont: bundledFontSchema.optional(),
    appearance: appearanceSchema,
    activePresetId: z
      .string()
      .regex(/^[a-zA-Z0-9-]{1,64}$/)
      .nullable()
      .optional(),
    presets: z
      .array(appearancePresetSchema)
      .max(20)
      .refine((presets) => new Set(presets.map(({ id }) => id)).size === presets.length),
    operatorLanguage: z.enum(['en', 'es-419']),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();
export type AppearancePreferences = z.infer<typeof appearancePreferencesSchema>;
export const appearanceMessageSchema = z.object({
  event: z.literal('appearance-preferences'),
  payload: appearancePreferencesSchema
});
export const appearanceExportSchema = z
  .object({
    format: z.literal('jabs-appearance'),
    version: z.literal(1),
    name: label.refine((value) => value.trim().length > 0),
    appearance: appearanceSchema
  })
  .strict();

export function parseAppearanceFile(text: string) {
  if (text.length > 65536) throw new Error('Appearance file is too large.');
  return appearanceExportSchema.parse(JSON.parse(text));
}

export function exportAppearance(name: string, appearance: Appearance): string {
  return JSON.stringify(
    appearanceExportSchema.parse({ format: 'jabs-appearance', version: 1, name, appearance }),
    null,
    2
  );
}
