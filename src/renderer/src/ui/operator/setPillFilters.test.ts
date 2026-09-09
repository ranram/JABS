import { expect, it } from 'vitest';
import {
  matchesSetPills,
  streamAssignmentFilterValue,
  streamAssignmentFromSet,
  streamPlatform,
  visibleStreamAssignment
} from './setPillFilters';

it('combines categories, accepts alternatives within a category, and prioritizes the on-stream state', () => {
  const set = { id: '1', state: '3', station: 'Station 2' };
  const assignment = { setId: '1', streamName: 'Main', streamSource: 'twitch', queuePosition: 1 };
  const streamFilter = `stream:${streamAssignmentFilterValue(assignment)}`;
  expect(matchesSetPills(set, [], undefined)).toBe(true);
  expect(matchesSetPills(set, ['status:pending', 'status:completed', 'station:Station 2', streamFilter], assignment)).toBe(true);
  expect(matchesSetPills(set, ['status:completed', 'station:Station 3'], assignment)).toBe(false);
  expect(matchesSetPills(set, ['stream:TWITCH:Other'], assignment)).toBe(false);
  expect(matchesSetPills(set, ['status:completed'], assignment, '1')).toBe(false);
  expect(matchesSetPills(set, ['status:stream', streamFilter], assignment, '1')).toBe(true);
  expect(matchesSetPills({ id: '2' }, ['status:pending'])).toBe(true);
  expect(streamPlatform('YouTube')).toBe('youtube');
  expect(streamPlatform('TWITCH')).toBe('twitch');
  expect(streamPlatform('TWITCH_STREAM')).toBe('twitch');
  expect(streamPlatform(undefined, 'https://twitch.tv/mainstage')).toBe('twitch');
  expect(streamPlatform('CUSTOM')).toBe('stream');
  expect(streamAssignmentFromSet({ id: '2', streamName: 'side-stream', streamSource: 'TWITCH' }))
    .toEqual({ setId: '2', streamName: 'side-stream', streamSource: 'TWITCH', queuePosition: 0 });
  expect(visibleStreamAssignment({ ...set, streamName: 'mainstage' }, assignment)).toBeUndefined();
  expect(visibleStreamAssignment({ id: '2', state: '1' }, assignment)).toBe(assignment);
});
