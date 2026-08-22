export const STARTGG_ENDPOINT = 'https://api.start.gg/gql/alpha';

export function normalizeTournamentSlug(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error('Enter a tournament slug or start.gg URL first.');
  }

  let path = value;
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('Enter a valid start.gg tournament URL.');
    }

    if (url.protocol !== 'https:' || !['start.gg', 'www.start.gg'].includes(url.hostname)) {
      throw new Error('Only official https://start.gg tournament URLs are accepted.');
    }
    path = url.pathname;
  }

  const parts = path.split('/').filter(Boolean);
  if (parts[0]?.toLocaleLowerCase() === 'tournament') {
    if (!parts[1]) {
      throw new Error('The start.gg URL does not include a tournament slug.');
    }
    return parts[1];
  }

  if (parts.length !== 1) {
    throw new Error('Enter a tournament slug or an official start.gg tournament URL.');
  }

  return parts[0];
}

export function normalizeEventSlug(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('Enter a completed start.gg event URL first.');
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('Enter a valid start.gg event URL.');
    }
    if (url.protocol !== 'https:' || !['start.gg', 'www.start.gg'].includes(url.hostname)) {
      throw new Error('Only official https://start.gg event URLs are accepted.');
    }
    path = url.pathname;
  }
  const parts = path.split('/').filter(Boolean);
  if (
    parts.length >= 4
    && parts[0]?.toLocaleLowerCase() === 'tournament'
    && parts[2]?.toLocaleLowerCase() === 'event'
    && parts[1]
    && parts[3]
  ) {
    return `tournament/${parts[1]}/event/${parts[3]}`;
  }
  throw new Error('Enter an official start.gg URL for a specific event.');
}

export type GraphqlResponse<T> = {
  data?: T;
  success?: boolean;
  message?: string;
  errors?: Array<{
    message: string;
    path?: Array<string | number>;
  }>;
};

export type StartggPageInfoNode = {
  total?: number | null;
  totalPages?: number | null;
};

export type StartggEventNode = {
  id: string | number;
  name?: string | null;
  videogame?: {
    id: string | number;
    name?: string | null;
  } | null;
};

export type StartggPhaseNode = {
  id: string | number;
  name?: string | null;
};

export type StartggPhaseGroupNode = {
  id: string | number;
  displayIdentifier?: string | null;
};

export type StartggConnection<T> = {
  pageInfo?: StartggPageInfoNode | null;
  nodes?: Array<T | null> | null;
};

export type StartggSetNode = {
  id: string | number;
  displayScore?: string | null;
  fullRoundText?: string | null;
  phaseGroup?: {
    id?: string | number;
    displayIdentifier?: string | null;
    phase?: {
      id?: string | number;
      name?: string | null;
    } | null;
  } | null;
  state?: number | string | null;
  station?: {
    id?: string | number;
    number?: number | null;
  } | null;
  slots?: Array<{
    id: string | number;
    entrant?: {
      id: string | number;
      name: string;
      participants?: Array<{
        id: string | number;
        gamerTag?: string | null;
        prefix?: string | null;
        user?: {
          genderPronoun?: string | null;
          location?: {
            country?: string | null;
            state?: string | null;
          } | null;
        } | null;
      }> | null;
    } | null;
    standing?: {
      stats?: {
        score?: {
          value?: number | null;
        } | null;
      } | null;
    } | null;
  } | null> | null;
};
