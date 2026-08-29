import { useEffect, useState } from 'react';
import type { CustomScoreboard } from '@shared/customScoreboards';
import { api } from '../api';

export function useCustomScoreboard(scoreboardId: string | undefined, revision?: string): {
  scoreboard?: CustomScoreboard;
  frameUrl?: string;
} {
  const scoreboard = useCustomScoreboardManifest(scoreboardId, revision);
  const [frameUrl, setFrameUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!scoreboard) {
      setFrameUrl(undefined);
      return () => { active = false; };
    }
    void api.customScoreboardFrameUrl(scoreboard).then(
      (url) => { if (active) setFrameUrl(url); },
      () => { if (active) setFrameUrl(undefined); }
    );
    return () => { active = false; };
  }, [scoreboard]);

  return { scoreboard, frameUrl };
}

export function useCustomScoreboardManifest(
  scoreboardId: string | undefined,
  revision?: string
): CustomScoreboard | undefined {
  const [scoreboard, setScoreboard] = useState<CustomScoreboard>();

  useEffect(() => {
    let active = true;
    if (!scoreboardId) {
      setScoreboard(undefined);
      return () => { active = false; };
    }
    void api.customScoreboards().then(
      ({ scoreboards }) => {
        if (active) setScoreboard(scoreboards.find((candidate) => candidate.id === scoreboardId));
      },
      () => { if (active) setScoreboard(undefined); }
    );
    return () => { active = false; };
  }, [scoreboardId, revision]);

  return scoreboard;
}
