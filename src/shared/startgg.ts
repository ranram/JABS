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
