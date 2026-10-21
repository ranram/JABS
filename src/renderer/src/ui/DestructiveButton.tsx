import { Button } from '@mantine/core';
import './destructiveButton.css';

export const DestructiveButton = Button.withProps({
  color: 'red',
  variant: 'light',
  className: 'operator-destructive-button'
});
