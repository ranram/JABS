import { Button, Menu } from '@mantine/core';
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SelectedSetState } from '@shared/models';
import { OperatorIcon, ListChecksIcon, UsersIcon } from '../icons';
import { useTutorialActive } from '../tutorials/tutorialActivity';
import { PlayerLibraryLauncherContext } from '../players/PlayerLibraryLauncherContext';
import { PlayerLibraryDialog } from '../players/PlayerLibraryModal';
import { QueueButton } from './MatchQueueControls';

export function MatchesMenu({
  activeSet,
  setSelectorDisabled,
  onOpenSetSelector
}: {
  activeSet?: SelectedSetState;
  setSelectorDisabled: boolean;
  onOpenSetSelector(): void;
}) {
  const { t } = useTranslation('operator');
  const [libraryOpened, setLibraryOpened] = useState(false);
  const openPlayers = useContext(PlayerLibraryLauncherContext);
  const tutorialActive = useTutorialActive();
  return (
    <div className="workspace-maintenance-group workspace-maintenance-matches">
      <Menu
        position="bottom-start"
        shadow="md"
        width={280}
        trapFocus={!tutorialActive}
        closeOnClickOutside={!tutorialActive}
      >
        <Menu.Target>
          <Button
            size="compact-xs"
            variant="default"
            data-tutorial="matches-menu"
            leftSection={<OperatorIcon icon={ListChecksIcon} size={14} />}
            rightSection={<span aria-hidden="true">▾</span>}
          >
            {t('utilityGroups.matches')}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            data-tutorial="players"
            aria-keyshortcuts="F5"
            onClick={() => (openPlayers ? openPlayers() : setLibraryOpened(true))}
            leftSection={<OperatorIcon icon={UsersIcon} />}
          >
            {t('players.title')}
          </Menu.Item>
          <Menu.Item
            data-tutorial="set-selector-open"
            aria-keyshortcuts="F7 Control+Shift+E"
            disabled={setSelectorDisabled}
            onClick={onOpenSetSelector}
            leftSection={<OperatorIcon icon={ListChecksIcon} />}
          >
            {t('selector.open')}
          </Menu.Item>
          <QueueButton menuItem showStatus />
        </Menu.Dropdown>
      </Menu>
      <PlayerLibraryDialog selectedSet={activeSet} opened={libraryOpened} onClose={() => setLibraryOpened(false)} />
    </div>
  );
}
