import { Anchor, type AnchorProps } from '@mantine/core';
import type { MouseEvent, MouseEventHandler, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isTauriRuntime, openNativeExternalUrl } from '../../desktopRuntime';
import { useOperatorNotifications } from './useOperatorNotifications';

type ExternalLinkProps = AnchorProps & {
  href: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  onAuxClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function ExternalLink({ href, onClick, onAuxClick, ...props }: ExternalLinkProps) {
  const { t } = useTranslation('operator');
  const notify = useOperatorNotifications();

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!isTauriRuntime() || event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
    event.preventDefault();
    void openNativeExternalUrl(href).catch(() => notify(t('messages.openLinkFailed'), 'error'));
  }

  return (
    <Anchor
      {...props}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        onClick?.(event);
        open(event);
      }}
      onAuxClick={(event) => {
        onAuxClick?.(event);
        open(event);
      }}
    />
  );
}
