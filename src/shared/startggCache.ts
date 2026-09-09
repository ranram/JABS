import { z } from 'zod';
import type {
  StartggEvent,
  StartggPhase,
  StartggPhaseGroupPage,
  StartggSetPage
} from './models';

const requiredText = z.string().trim().min(1);
const optionalText = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() || undefined : value),
  z.string().optional()
);

const pageInfoSchema = z.object({
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative()
});

const eventSchema = z.object({
  id: requiredText,
  name: requiredText,
  videogame: z.object({ id: requiredText, name: requiredText }).optional()
});

const phaseSchema = z.object({
  id: requiredText,
  name: requiredText
});

const phaseGroupSchema = z.object({
  id: requiredText,
  displayIdentifier: requiredText
});

const entrantSchema = z.object({
  id: requiredText,
  name: requiredText
});

const setSummarySchema = z.object({
  id: requiredText,
  displayScore: optionalText,
  entrantOneScore: z.number().int().nonnegative().optional(),
  entrantTwoScore: z.number().int().nonnegative().optional(),
  phase: optionalText,
  phaseGroup: optionalText,
  round: optionalText,
  state: optionalText,
  station: optionalText,
  streamName: optionalText,
  streamSource: optionalText,
  entrantOne: entrantSchema.optional(),
  entrantTwo: entrantSchema.optional()
});

export const startggEventsCacheSchema = z.array(eventSchema);
export const startggPhasesCacheSchema = z.array(phaseSchema);
export const startggPhaseGroupPageCacheSchema = z.object({
  phaseGroups: z.array(phaseGroupSchema),
  pageInfo: pageInfoSchema
});
export const startggSetPageCacheSchema = z.object({
  sets: z.array(setSummarySchema),
  pageInfo: pageInfoSchema
});

export function parseStartggEventsCache(value: unknown): StartggEvent[] | undefined {
  const result = startggEventsCacheSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseStartggPhasesCache(value: unknown): StartggPhase[] | undefined {
  const result = startggPhasesCacheSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseStartggPhaseGroupPageCache(
  value: unknown
): StartggPhaseGroupPage | undefined {
  const result = startggPhaseGroupPageCacheSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseStartggSetPageCache(value: unknown): StartggSetPage | undefined {
  const result = startggSetPageCacheSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
