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
