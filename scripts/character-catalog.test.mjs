import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCharacterCatalog } from './character-catalog.mjs';

test('catalog validation rejects ambiguous labels and accepts same-character spelling variants', () => {
  const character = (name, aliases = []) => ({ name, aliases });
  for (const characters of [
    [], [character('A.K.I.'), character('AKI')],
    [character('M. Bison', ['Vega']), character('Vega')],
    [character('One', ['Same']), character('Two', ['same'])],
    [character('One', ['../two'])],
    [character('One', [''])], [character('One', [' Alias'])],
    [{ name: 'One', aliases: 'Alias' }], [{ name: 'One', aliases: [], typo: true }]
  ]) assert.throws(() => validateCharacterCatalog({ characters }, 'fixture'));
  const valid = validateCharacterCatalog({ characters: [character('Hero', ['Yūsha']), character('A.K.I.')] }, 'fixture');
  assert.deepEqual(valid.names, ['Hero', 'A.K.I.']);
  assert.equal(valid.aliases.yusha, 'Hero');
  const variants = validateCharacterCatalog({ characters: [character('Bedman?', ['Bedman']), character('A.K.I.', ['AKI'])] }, 'fixture');
  assert.deepEqual(variants.names, ['Bedman?', 'A.K.I.']);
  assert.deepEqual(Object.keys(variants.aliases), []);
});
