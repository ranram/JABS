import { Button, Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import { sortByLabel } from './operatorUtils';
import { publicOverlayKinds } from './overlaySources';
import { en } from '../../i18n/catalogs/en';
import { OperatorIcon, CopyIcon, CheckIcon } from '../icons';

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
  const sortedKinds = sortByLabel(publicOverlayKinds, (kind) => en.operator.live.overlayNames[kind], 'en');
  const label = copied ? t('live.copiedOverlay', { overlay: t(`live.overlayNames.${copied}`) }) : t('live.copyObs');
  return (
    <Menu position="bottom-end" shadow="md" width={280}>
      <Menu.Target>
        <Button
          data-testid="copy-obs-url"
          size={compact ? 'compact-xs' : undefined}
          variant="default"
          disabled={disabled}
          leftSection={<OperatorIcon icon={copied ? CheckIcon : CopyIcon} size={compact ? 14 : 16} />}
          rightSection={<span aria-hidden="true">▾</span>}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {sortedKinds.map((kind) => (
          <Menu.Item key={kind} onClick={() => onCopy(kind)} leftSection={<OperatorIcon icon={CopyIcon} />}>
            {t(`live.overlayNames.${kind}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
