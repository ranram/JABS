export type NormalizedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BroadcastSurfaceId =
  | 'versus'
  | 'winner'
  | 'champion'
  | 'commentators'
  | 'top-eight'
  | 'thumbnail';

export type ParticipantMedia = {
  characterAssetId?: string;
  photoAssetId?: string;
  sponsorLogoAssetId?: string;
};

export type BroadcastParticipant = {
  entrantId?: string;
  name: string;
  character?: string;
  sponsor?: string;
  seed?: number;
  placement?: number;
  media?: ParticipantMedia;
};

export type BroadcastCompositionDraft = {
  surface: BroadcastSurfaceId;
  gameId: string;
  tournamentName?: string;
  headline?: string;
  participants: BroadcastParticipant[];
};

export type BroadcastSurfaceSpec = {
  id: BroadcastSurfaceId;
  canvas: { width: number; height: number };
  participantRange: readonly [minimum: number, maximum: number];
  regions: Readonly<Record<string, NormalizedRegion>>;
};

export const broadcastSurfaceSpecs: Readonly<Record<BroadcastSurfaceId, BroadcastSurfaceSpec>> = {
  versus: {
    id: 'versus',
    canvas: { width: 1920, height: 1080 },
    participantRange: [2, 2],
    regions: {
      leftSubject: { x: 0.02, y: 0.08, width: 0.45, height: 0.82 },
      rightSubject: { x: 0.53, y: 0.08, width: 0.45, height: 0.82 },
      matchContext: { x: 0.34, y: 0.04, width: 0.32, height: 0.14 },
      leftIdentity: { x: 0.03, y: 0.82, width: 0.39, height: 0.14 },
      rightIdentity: { x: 0.58, y: 0.82, width: 0.39, height: 0.14 }
    }
  },
  winner: {
    id: 'winner',
    canvas: { width: 1920, height: 1080 },
    participantRange: [1, 1],
    regions: {
      subject: { x: 0.36, y: 0.05, width: 0.61, height: 0.9 },
      announcement: { x: 0.04, y: 0.12, width: 0.4, height: 0.24 },
      identity: { x: 0.04, y: 0.57, width: 0.48, height: 0.25 },
      sponsor: { x: 0.04, y: 0.84, width: 0.22, height: 0.1 }
    }
  },
  champion: {
    id: 'champion',
    canvas: { width: 1920, height: 1080 },
    participantRange: [1, 1],
    regions: {
      subject: { x: 0.31, y: 0.02, width: 0.67, height: 0.94 },
      announcement: { x: 0.04, y: 0.08, width: 0.43, height: 0.28 },
      identity: { x: 0.04, y: 0.56, width: 0.5, height: 0.27 },
      sponsor: { x: 0.04, y: 0.85, width: 0.22, height: 0.09 }
    }
  },
  commentators: {
    id: 'commentators',
    canvas: { width: 1920, height: 1080 },
    participantRange: [1, 4],
    regions: { desk: { x: 0.04, y: 0.14, width: 0.92, height: 0.76 } }
  },
  'top-eight': {
    id: 'top-eight',
    canvas: { width: 1920, height: 1080 },
    participantRange: [8, 8],
    regions: {
      champion: { x: 0.33, y: 0.12, width: 0.34, height: 0.49 },
      second: { x: 0.04, y: 0.2, width: 0.25, height: 0.35 },
      third: { x: 0.71, y: 0.2, width: 0.25, height: 0.35 },
      placements: { x: 0.04, y: 0.66, width: 0.92, height: 0.27 },
      headline: { x: 0.25, y: 0.02, width: 0.5, height: 0.1 }
    }
  },
  thumbnail: {
    id: 'thumbnail',
    canvas: { width: 1280, height: 720 },
    participantRange: [0, 4],
    regions: {
      subjects: { x: 0.34, y: 0.04, width: 0.64, height: 0.92 },
      headline: { x: 0.03, y: 0.13, width: 0.48, height: 0.48 },
      eventMark: { x: 0.03, y: 0.74, width: 0.24, height: 0.16 }
    }
  }
};

export function validateBroadcastComposition(draft: BroadcastCompositionDraft): string | undefined {
  const spec = broadcastSurfaceSpecs[draft.surface];
  const [minimum, maximum] = spec.participantRange;
  if (draft.participants.length < minimum || draft.participants.length > maximum) {
    return `${draft.surface} requires ${minimum === maximum ? minimum : `${minimum}-${maximum}`} participants.`;
  }
  if (draft.participants.some((participant) => !participant.name.trim())) {
    return 'Every broadcast participant requires a name.';
  }
  if (draft.participants.some((participant) => (
    participant.seed !== undefined
    && (!Number.isSafeInteger(participant.seed) || participant.seed < 1)
  ))) {
    return 'Broadcast participant seeds must be positive integers.';
  }
  return undefined;
}
