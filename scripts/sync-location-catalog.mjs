import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getCountries, getStatesOfCountry } from '@countrystatecity/countries';

const root = process.cwd();
const outputPath = resolve(root, 'src-tauri/resources/location_catalog.json');
const countries = await getCountries();
const catalog = [];

for (const country of countries) {
  const states = await getStatesOfCountry(country.iso2);
  catalog.push({
    code: country.iso2,
    name: country.name,
    emoji: country.emoji,
    states: states.map(({ iso2, name }) => ({ code: iso2, name }))
  });
}

catalog.sort((left, right) => left.name.localeCompare(right.name, 'en'));
for (const country of catalog) {
  country.states.sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

const generated = `${JSON.stringify(catalog, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== generated) {
    throw new Error('Generated native location catalog is stale. Run pnpm run locations:sync and review the diff.');
  }
} else {
  await mkdir(resolve(root, 'src-tauri/resources'), { recursive: true });
  await writeFile(outputPath, generated, 'utf8');
}
