import { useTranslation } from 'react-i18next';
import './resultMarker.css';

export function ResultMarker({ mark, className = '' }: { mark: 'W' | 'L' | 'DQ'; className?: string }) {
  const { t } = useTranslation('operator');
  const label = t(mark === 'DQ' ? 'selector.disqualified' : mark === 'W' ? 'selector.winner' : 'selector.loser');
  return (
    <span className={`result-marker ${className}`} data-mark={mark} title={label} aria-label={label}>
      {mark}
    </span>
  );
}
