import { createContext, useContext } from 'react';
import { Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ListChecksIcon, OperatorIcon } from '../icons';

export const SetSelectorLauncherContext = createContext<{ disabled: boolean; open(): void } | undefined>(undefined);

export function SetSelectorButton() {
  const launcher = useContext(SetSelectorLauncherContext);
  const { t } = useTranslation('operator');
  if (!launcher) return null;
  return (
    <Button
      aria-keyshortcuts="F7 Control+Shift+E"
      size="compact-sm"
      variant="default"
      leftSection={<OperatorIcon icon={ListChecksIcon} />}
      disabled={launcher.disabled}
      onClick={launcher.open}
    >
      {t('selector.open')}
    </Button>
  );
}
