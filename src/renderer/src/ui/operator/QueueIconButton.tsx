import { ActionIcon, Tooltip } from '@mantine/core';
import { OperatorIcon, type Icon } from '../icons';

export function QueueIconButton({
  label,
  icon,
  disabled,
  destructive = false,
  onClick
}: {
  label: string;
  icon: Icon;
  disabled: boolean;
  destructive?: boolean;
  onClick(): void;
}) {
  return (
    <Tooltip label={label} openDelay={250} events={{ hover: true, focus: true, touch: true }}>
      <span className="match-queue-action">
        <ActionIcon
          aria-label={label}
          size={30}
          variant={destructive ? 'light' : 'default'}
          color={destructive ? 'red' : undefined}
          disabled={disabled}
          onClick={onClick}
        >
          <OperatorIcon icon={icon} size={16} />
        </ActionIcon>
      </span>
    </Tooltip>
  );
}
