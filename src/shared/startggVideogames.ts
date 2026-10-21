import { z } from 'zod';

export const startggVideogameSchema = z.object({
  id: z.string().min(1),
  name: z.string()
});
export type StartggVideogame = z.infer<typeof startggVideogameSchema>;

export const startggVideogamesSchema = z.object({
  games: z.array(startggVideogameSchema),
  cached: z.boolean()
});

export const gameCharacterPreparationSchema = z.object({
  created: z.number().int().nonnegative(),
  rosterAvailable: z.boolean()
});

export type GameCharacterPreparation = z.infer<typeof gameCharacterPreparationSchema>;
