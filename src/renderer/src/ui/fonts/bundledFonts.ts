import type { BundledFontId } from '@shared/fonts';
import '../operator/generatorFonts.css';
import './bundledFonts.css';

export const bundledFonts: Record<BundledFontId, { label: string; family: string }> = {
  anton: { label: 'Anton', family: '"JABS Anton"' },
  'archivo-black': { label: 'Archivo Black', family: '"JABS Archivo Black"' },
  'barlow-condensed': { label: 'Barlow Condensed', family: '"JABS Barlow Condensed"' },
  'bebas-neue': { label: 'Bebas Neue', family: '"JABS Bebas Neue"' },
  'bungee-shade': { label: 'Bungee Shade', family: '"JABS Bungee Shade"' },
  inter: { label: 'Inter', family: '"JABS Inter"' },
  lato: { label: 'Lato', family: '"JABS Lato"' },
  montserrat: { label: 'Montserrat', family: '"JABS Montserrat"' },
  oswald: { label: 'Oswald', family: '"JABS Oswald"' },
  oxanium: { label: 'Oxanium', family: '"JABS Oxanium"' },
  'titan-one': { label: 'Titan One', family: '"JABS Titan One"' }
};
