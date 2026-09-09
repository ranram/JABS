import type { SetSummary, StartggStreamAssignment } from '@shared/models';
import { setStatusTone } from './operatorUtils';

export function matchesSetPills(
  set: SetSummary,
  filters: readonly string[],
  assignment?: StartggStreamAssignment,
  activeSetId?: string
): boolean {
  const values = {
    status: setStatusTone(set, activeSetId),
    station: set.station,
    stream: assignment ? streamAssignmentFilterValue(assignment) : undefined
  };
  return Object.entries(values).every(([category, value]) => {
    const selected = filters.filter((filter) => filter.startsWith(`${category}:`));
    return selected.length === 0 || selected.includes(`${category}:${value}`);
  });
}

export function streamAssignmentFilterValue(assignment: StartggStreamAssignment): string {
  return `${normalizedStreamSource(assignment.streamSource)}:${assignment.streamName}`;
}

export function streamAssignmentFromSet(set: SetSummary): StartggStreamAssignment | undefined {
  if (!set.streamName) return undefined;
  return {
    setId: set.id,
    streamName: set.streamName,
    streamSource: set.streamSource,
    queuePosition: 0
  };
}

export function visibleStreamAssignment(
  set: SetSummary,
  queuedAssignment?: StartggStreamAssignment
): StartggStreamAssignment | undefined {
  if (set.state === '3') return undefined;
  return queuedAssignment ?? streamAssignmentFromSet(set);
}

export function streamPlatform(source?: string, streamName?: string): 'youtube' | 'twitch' | 'stream' {
  const normalizedSource = normalizedStreamSource(source);
  if (normalizedSource.includes('TWITCH')) return 'twitch';
  if (normalizedSource.includes('YOUTUBE')) return 'youtube';

  const normalizedName = streamName?.trim().toUpperCase() ?? '';
  if (normalizedName.includes('TWITCH.TV/')) return 'twitch';
  if (normalizedName.includes('YOUTUBE.COM/') || normalizedName.includes('YOUTU.BE/')) return 'youtube';
  return 'stream';
}

function normalizedStreamSource(source?: string): string {
  return source?.trim().toUpperCase() || 'UNKNOWN';
}
