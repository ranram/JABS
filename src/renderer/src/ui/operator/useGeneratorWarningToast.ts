import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';

export type GeneratorWarning = {
  message: string;
  revision: number;
};

export function nextGeneratorWarning(error: unknown, current?: GeneratorWarning): GeneratorWarning {
  return {
    message: error instanceof Error ? error.message : 'JABS rejected this generator update.',
    revision: (current?.revision ?? 0) + 1
  };
}

export function useGeneratorWarningToast(
  id: string,
  warning: GeneratorWarning | undefined,
  title: string
) {
  useEffect(() => {
    if (!warning) return;
    // Recreate the fixed-id toast so an identical second rejection is visible
    // even after the operator corrected and then re-entered blocked text.
    notifications.hide(id);
    notifications.show({
      id,
      title,
      message: warning.message,
      color: 'red',
      autoClose: false,
      withCloseButton: true
    });
  }, [id, title, warning]);
}
