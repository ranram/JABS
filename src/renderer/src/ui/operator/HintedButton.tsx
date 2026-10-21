import { Button, Tooltip, type ButtonProps } from '@mantine/core';
import type { MouseEventHandler } from 'react';

/** Disabled actions keep their reason reachable by mouse, keyboard, and touch. */
export function HintedButton({
  reason,
  ...props
}: ButtonProps & { reason?: string; onClick?: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <Tooltip label={reason} disabled={!reason} events={{ hover: true, focus: true, touch: true }} openDelay={250}>
      <span tabIndex={props.disabled && reason ? 0 : undefined}>
        <Button {...props} />
      </span>
    </Tooltip>
  );
}
