import { z } from 'zod';

export const assetCatalogRevisionSchema = z.object({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
});

export const assetCatalogMessageSchema = assetCatalogRevisionSchema.extend({
  event: z.literal('asset-catalog')
});

export const playerLibraryMessageSchema = assetCatalogRevisionSchema.extend({ event: z.literal('player-library') });

export const assetCatalogCheckSchema = assetCatalogRevisionSchema.extend({
  changed: z.boolean()
});
