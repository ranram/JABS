import type { Icon } from '@phosphor-icons/react/dist/lib/types';
import type { ReactNode } from 'react';
import './operatorIcon.css';
export type { Icon };

// Individual icon imports avoid loading the full catalog during development.
export { ArrowsClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
export { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/csr/ArrowsLeftRight';
export { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
export { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
export { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
export { ArrowUpIcon } from '@phosphor-icons/react/dist/csr/ArrowUp';
export { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown';
export { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
export { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
export { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
export { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
export { FilmSlateIcon } from '@phosphor-icons/react/dist/csr/FilmSlate';
export { FloppyDiskIcon } from '@phosphor-icons/react/dist/csr/FloppyDisk';
export { FlagCheckeredIcon } from '@phosphor-icons/react/dist/csr/FlagCheckered';
export { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen';
export { GameControllerIcon } from '@phosphor-icons/react/dist/csr/GameController';
export { ImageIcon } from '@phosphor-icons/react/dist/csr/Image';
export { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
export { IdentificationCardIcon } from '@phosphor-icons/react/dist/csr/IdentificationCard';
export { KeyboardIcon } from '@phosphor-icons/react/dist/csr/Keyboard';
export { KeyIcon } from '@phosphor-icons/react/dist/csr/Key';
export { MicrophoneIcon } from '@phosphor-icons/react/dist/csr/Microphone';
export { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
export { MonitorIcon } from '@phosphor-icons/react/dist/csr/Monitor';
export { ListChecksIcon } from '@phosphor-icons/react/dist/csr/ListChecks';
export { ListNumbersIcon } from '@phosphor-icons/react/dist/csr/ListNumbers';
export { PauseIcon } from '@phosphor-icons/react/dist/csr/Pause';
export { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
export { PlayIcon } from '@phosphor-icons/react/dist/csr/Play';
export { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
export { PlugsConnectedIcon } from '@phosphor-icons/react/dist/csr/PlugsConnected';
export { QuestionIcon } from '@phosphor-icons/react/dist/csr/Question';
export { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
export { ShieldCheckIcon } from '@phosphor-icons/react/dist/csr/ShieldCheck';
export { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
export { StopIcon } from '@phosphor-icons/react/dist/csr/Stop';
export { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
export { StackIcon } from '@phosphor-icons/react/dist/csr/Stack';
export { TreeStructureIcon } from '@phosphor-icons/react/dist/csr/TreeStructure';
export { TrophyIcon } from '@phosphor-icons/react/dist/csr/Trophy';
export { TrashSimpleIcon } from '@phosphor-icons/react/dist/csr/TrashSimple';
export { BookOpenIcon } from '@phosphor-icons/react/dist/csr/BookOpen';
export { LifebuoyIcon } from '@phosphor-icons/react/dist/csr/Lifebuoy';
export { HeartIcon } from '@phosphor-icons/react/dist/csr/Heart';
export { TwitchLogoIcon } from '@phosphor-icons/react/dist/csr/TwitchLogo';
export { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
export { UserIcon } from '@phosphor-icons/react/dist/csr/User';
export { WrenchIcon } from '@phosphor-icons/react/dist/csr/Wrench';
export { XIcon } from '@phosphor-icons/react/dist/csr/X';
export { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
export { YoutubeLogoIcon } from '@phosphor-icons/react/dist/csr/YoutubeLogo';

/** Labels carry the meaning; these small, static icons are decorative. */
export function OperatorIcon({ icon: IconComponent, size = 16 }: { icon: Icon; size?: number }) {
  return (
    <IconComponent
      className="operator-icon"
      size={size}
      weight="regular"
      color="currentColor"
      aria-hidden="true"
      focusable="false"
    />
  );
}

export function IconLabel({ icon, children, size = 16 }: { icon: Icon; children: ReactNode; size?: number }) {
  return (
    <span className="operator-icon-label">
      <OperatorIcon icon={icon} size={size} />
      <span>{children}</span>
    </span>
  );
}
