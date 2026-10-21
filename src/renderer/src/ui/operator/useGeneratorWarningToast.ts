import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';

export type GeneratorWarning = {
  message?: string;
  revision: number;
};

export function nextGeneratorWarning(error: unknown, current?: GeneratorWarning): GeneratorWarning {
  return {
    message: error instanceof Error ? error.message : undefined,
    revision: (current?.revision ?? 0) + 1
  };
}

export function useGeneratorWarningToast(id: string, warning: GeneratorWarning | undefined, title: string) {
  const { t } = useTranslation('operator');
  useEffect(() => {
    if (!warning) return;
    // Recreate the fixed-id toast so an identical second rejection is visible
    // even after the operator corrected and then re-entered blocked text.
    notifications.hide(id);
    notifications.show({
      id,
      title,
      message: warning.message || t('generators.previewFailed'),
      color: 'red',
      withCloseButton: true
    });
  }, [id, title, warning, t]);
}
