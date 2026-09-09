// Keep normalization in sync with the shared and native character matchers.
export function normalizeCharacterLabel(value) {
  return value.replaceAll('&', ' and ').normalize('NFKD').replace(/\p{Mark}/gu, '')
    .toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, '');
}

export function validateCharacterCatalog(catalog, source) {
  const fail = (reason) => { throw new Error(`${source}: ${reason}`); };
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)
    || Object.keys(catalog).some((key) => key !== 'characters')
    || !Array.isArray(catalog.characters) || !catalog.characters.length) fail('Expected a nonempty characters array.');
  const owners = new Map();
  const names = [];
  const aliases = Object.create(null);
  function label(value) {
    if (typeof value !== 'string' || !value || value !== value.trim()
      || /[/\\\p{Control}]/u.test(value) || !normalizeCharacterLabel(value)) fail('Names and aliases must be nonempty, trimmed labels without paths or control characters.');
    return normalizeCharacterLabel(value);
  }
  for (const entry of catalog.characters) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some((key) => !['name', 'aliases'].includes(key))
      || !Array.isArray(entry.aliases)) fail('Each character needs a name and an aliases array.');
    const key = label(entry.name);
    if (owners.has(key)) fail(`Duplicate character: ${entry.name}.`);
    owners.set(key, entry.name);
    names.push(entry.name);
  }
  for (const entry of catalog.characters) {
    for (const alias of entry.aliases) {
      const key = label(alias);
      if (owners.has(key)) {
        if (owners.get(key) === entry.name) continue;
        fail(`Alias ${alias} conflicts with ${owners.get(key)}.`);
      }
      owners.set(key, entry.name);
      aliases[key] = entry.name;
    }
  }
  return { names, aliases };
}
