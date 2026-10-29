import { parsePlayerStatsSettingsRealtime } from '@shared/playerStatsSettings';
import { api } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

const parseMessage = (value: unknown) => parseRealtimeJson(value, parsePlayerStatsSettingsRealtime);

export function usePlayerStatsSettings() {
  return useRealtimeState({
    load: api.playerStatsSettings,
    diagnosticOperation: 'player-stats-settings',
    parseMessage,
    loadError: 'Unable to load Player Stats settings.'
  });
}
