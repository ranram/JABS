import {
  canonicalGameId,
  resolveGameProfile,
  type GameId,
  type OverlayTemplateId
} from '../../../shared/gameProfiles';

const overlayPathPattern = /^\/overlay\/([^/]+)\/main\/?$/;
const activeOverlayPathPattern = /^\/overlay\/active\/main\/?$/;
const activeAnnouncementPathPattern = /^\/overlay\/active\/(winner|champion)\/?$/;
const commentatorPathPattern = /^\/overlay\/commentators\/?$/;
const versusPathPattern = /^\/overlay\/active\/versus\/?$/;

export function isCommentatorOverlayPath(pathname: string): boolean {
  return commentatorPathPattern.test(pathname);
}

export function isVersusOverlayPath(pathname: string): boolean {
  return versusPathPattern.test(pathname);
}

export function gameIdFromOverlayPath(pathname: string): GameId | undefined {
  const match = overlayPathPattern.exec(pathname);
  if (!match) {
    return undefined;
  }

  let candidate: string;
  try {
    candidate = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }

  return canonicalGameId(candidate);
}

export function announcementSurfaceFromOverlayPath(
  pathname: string
): 'result' | undefined {
  return activeAnnouncementPathPattern.test(pathname) ? 'result' : undefined;
}

export function resolveOverlayPresentation(
  pathname: string,
  selectedGameId: string | undefined
): {
  gameId: GameId;
  template: OverlayTemplateId;
} | undefined {
  const routedGameId = gameIdFromOverlayPath(pathname);
  if (!routedGameId && !activeOverlayPathPattern.test(pathname)) {
    return undefined;
  }

  const profile = resolveGameProfile(routedGameId ?? selectedGameId);

  return {
    gameId: profile.id,
    template: profile.overlay.template
  };
}
