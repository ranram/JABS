import { useTranslation } from 'react-i18next';
import { defaultCustomScoreboardFont } from '@shared/customScoreboards';
import type { BundledFontId } from '@shared/fonts';
import { useAppearance } from '../appearance/AppearanceProvider';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';
import { ScoreboardFontSelect } from './ScoreboardFontSelect';

export function BroadcastScoreboardFontSelect({
  customActive = false,
  customFont
}: {
  customActive?: boolean;
  customFont?: BundledFontId;
}) {
  const { t } = useTranslation('operator');
  const { state, ready, error, update } = useAppearance();
  const notify = useOperatorNotifications();
  return (
    <ScoreboardFontSelect
      label={t('editor.scoreboardFont')}
      description={!ready ? t(error ? 'editor.fontSettingsRetrying' : 'editor.fontSettingsLoading') : undefined}
      value={customActive ? (customFont ?? defaultCustomScoreboardFont) : state.scoreboardFont}
      includeDefault
      disabled={!ready || customActive}
      onChange={(scoreboardFont) => {
        void update({ scoreboardFont }).then((saved) => {
          if (!saved) notify(t('editor.fontSaveFailed'), 'error');
        });
      }}
    />
  );
}
