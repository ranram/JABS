import { VisuallyHidden } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { OperatorIcon, XIcon } from './icons';

export function DialogCloseIcon() {
  const { t } = useTranslation('common');
  return (
    <>
      <OperatorIcon icon={XIcon} />
      <VisuallyHidden>{t('actions.close')}</VisuallyHidden>
    </>
  );
}
