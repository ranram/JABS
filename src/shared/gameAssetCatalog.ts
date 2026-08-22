export type GameAssetVideogame = {
  id?: string | number;
  name?: string | null;
};

export function gameAssetCatalogSlug(videogame: GameAssetVideogame | null | undefined): string | undefined {
  if (!videogame) return undefined;
  const fromName = slugPart(videogame.name ?? '');
  if (fromName) return fromName.slice(0, 80).replace(/-+$/u, '');
  const fromId = slugPart(String(videogame.id ?? ''));
  return fromId ? `startgg-game-${fromId}` : undefined;
}

export function isSafeGameAssetCatalogSlug(value: string): boolean {
  return value.length > 0
    && value.length <= 96
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function slugPart(value: string): string {
  return value
    .replace(/[™®©]/gu, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-+/gu, '-');
}
