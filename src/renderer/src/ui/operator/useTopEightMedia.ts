import type { TopEightEntrantMedia } from './TopEightCanvas';
import type { TopEightDraftController } from './useTopEightDraft';
import { useGeneratorMedia } from './useGeneratorMedia';

export function useTopEightMedia(
  draft: TopEightDraftController['draft'],
  assetCatalogRevision: number
) {
  const resolved = useGeneratorMedia({
    draft,
    subjects: draft.entrants,
    assetCatalogSlug: draft.assetCatalogSlug,
    assetCatalogRevision,
    context: { tournamentName: draft.tournamentName, headline: draft.headline }
  });
  return {
    ...resolved,
    media: resolved.media as TopEightEntrantMedia[],
    mediaWarning: resolved.warning
  };
}
