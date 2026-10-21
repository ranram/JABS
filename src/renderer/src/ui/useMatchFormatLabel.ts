import { useTranslation } from 'react-i18next';
import type { SelectedSetState } from '@shared/models';

export function useMatchFormatLabel(selectedSet?: SelectedSetState): string {
  const { t } = useTranslation('common');
  if (selectedSet?.matchFormat === 'topanga') return t('match.topanga');
  if (selectedSet?.matchFormat === 'first-to') {
    return t('match.firstTo', { count: Math.ceil(selectedSet.bestOf / 2) });
  }
  return t('match.bestOf', { count: selectedSet?.bestOf ?? 3 });
}
