import { Button, Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { LocalHandoffUrl } from '../../desktopRuntime';

const overlayKinds: LocalHandoffUrl[] = [
  'score', 'versus', 'winner', 'top-eight-matchups', 'commentators'
];

export function OverlayUrlMenu({
  copied,
  disabled = false,
  compact = false,
  onCopy
}: {
  copied?: LocalHandoffUrl;
  disabled?: boolean;
  compact?: boolean;
  onCopy(kind: LocalHandoffUrl): void;
}) {
  const { t } = useTranslation('operator');
  const label = copied
    ? t('live.copiedOverlay', { overlay: t(`live.overlayNames.${copied}`) })
    : t('live.copyObs');
  return (
    <Menu position="bottom-end" shadow="md" width={220}>
      <Menu.Target>
        <Button
          data-testid="copy-obs-url"
          size={compact ? 'compact-xs' : undefined}
          variant="default"
          disabled={disabled}
          rightSection={<span aria-hidden="true">▾</span>}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {overlayKinds.map((kind) => (
          <Menu.Item key={kind} onClick={() => onCopy(kind)}>
            {t(`live.overlayNames.${kind}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
