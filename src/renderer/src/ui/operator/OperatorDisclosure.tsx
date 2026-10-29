import type { ReactNode } from 'react';
import { IconLabel, SlidersHorizontalIcon, type Icon } from '../icons';

export function OperatorDisclosure({
  title,
  children,
  icon = SlidersHorizontalIcon,
  expandWhen = false,
  className = ''
}: {
  title: string;
  children: ReactNode;
  icon?: Icon;
  /** Reapply when the condition changes; the user can still toggle the section manually. */
  expandWhen?: boolean;
  className?: string;
}) {
  return (
    <details className={`operator-disclosure ${className}`} open={expandWhen}>
      <summary>
        <IconLabel icon={icon}>{title}</IconLabel>
      </summary>
      <div className="operator-disclosure-content">{children}</div>
    </details>
  );
}
