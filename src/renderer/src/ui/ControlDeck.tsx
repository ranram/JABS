import type { ReactNode } from 'react';

export function TournamentBackdrop() {
  return <div className="tournament-backdrop" aria-hidden="true" />;
}

type SectionHeadingProps = {
  step?: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
};

export function SectionHeading({ step, title, description, trailing }: SectionHeadingProps) {
  return (
    <div className="deck-section-heading">
      <div className="deck-section-title">
        {step && <span className="deck-step">{step}</span>}
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {trailing}
    </div>
  );
}

type StatusBadgeProps = {
  children: ReactNode;
  tone?: 'ready' | 'warning' | 'live' | 'neutral';
};

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`deck-status deck-status-${tone}`}>{children}</span>;
}
