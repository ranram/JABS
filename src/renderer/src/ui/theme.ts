import { Alert, Notification, createTheme, rem } from '@mantine/core';
import './notifications.css';

const warningNotice = {
  backgroundColor: '#29231d',
  border: '1px solid #685039',
  color: '#f1dfc5'
};

const toastColors = {
  yellow: warningNotice,
  red: { backgroundColor: '#2d1e23', border: '1px solid #70404b', color: '#f3d5dc' },
  green: { backgroundColor: '#1c2a24', border: '1px solid #3e6652', color: '#d4eddf' }
};

export const jabsTheme = createTheme({
  primaryColor: 'violet',
  components: {
    Alert: Alert.extend({
      defaultProps: { p: 'xs' },
      styles: (_theme, props) => props.color === 'yellow' ? {
        root: warningNotice,
        title: { color: '#f1dfc5' },
        message: { color: '#f1dfc5' },
        icon: { color: '#d3ab72' }
      } : {}
    }),
    Notification: Notification.extend({
      defaultProps: { p: 'xs' },
      classNames: { root: 'operator-toast', closeButton: 'operator-toast-close', body: 'operator-toast-body' },
      styles: (_theme, props) => {
        const colors = toastColors[props.color as keyof typeof toastColors];
        return colors ? {
          root: colors,
          title: { color: colors.color },
          description: { color: colors.color }
        } : {};
      }
    })
  },
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
