import { createTheme, rem } from '@mantine/core';

export const jabsTheme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  headings: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: '800'
  },
  spacing: {
    xs: rem(8),
    sm: rem(12),
    md: rem(16),
    lg: rem(24),
    xl: rem(32)
  },
  colors: {
    jabs: [
      '#f3f0ff',
      '#e7dbff',
      '#cfb5ff',
      '#b58bff',
      '#9f68ff',
      '#914fff',
      '#8b42ff',
      '#7734e4',
      '#692dcb',
      '#5925b3'
    ]
  }
});
