import { VisuallyHidden } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { StartggStreamAssignment } from '@shared/models';
import { OperatorIcon, TwitchLogoIcon, YoutubeLogoIcon } from '../icons';
import { streamPlatform } from './setPillFilters';
import './streamAssignmentLabel.css';

export function StreamAssignmentLabel({
  assignment,
  iconSize = 14
}: {
  assignment: Pick<StartggStreamAssignment, 'streamName' | 'streamSource'>;
  iconSize?: number;
}) {
  const { t } = useTranslation('operator');
  const platform = streamPlatform(assignment.streamSource, assignment.streamName);
  const platformLabel = t(`selector.streamPlatforms.${platform}`);
  const label = t('selector.streamAssignment', { platform: platformLabel, name: assignment.streamName });
  const icon = platform === 'youtube' ? YoutubeLogoIcon : platform === 'twitch' ? TwitchLogoIcon : undefined;

  return (
    <span className="stream-assignment-label" title={label}>
      {icon && <OperatorIcon icon={icon} size={iconSize} />}
      {icon && <VisuallyHidden>{platformLabel} · </VisuallyHidden>}
      <span className="stream-assignment-name">{icon ? assignment.streamName : label}</span>
    </span>
  );
}
