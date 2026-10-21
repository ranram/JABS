import { Loader, Select, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StartggVideogame } from '@shared/startggVideogames';
import { api } from '../../api';
import type { GameAssetPreparationStatus } from './useGameAssetPreparation';
import { sortByLabel } from './operatorUtils';

// Share the game list across stream state and both generators.
// After a failed request, reopening a selector tries again.
let catalogRequest: ReturnType<typeof api.videogames> | undefined;
export function loadGameCatalog() {
  catalogRequest ??= api.videogames().catch((error: unknown) => {
    catalogRequest = undefined;
    throw error;
  });
  return catalogRequest;
}

type GameSelectProps = {
  tournamentLoaded: boolean;
  eventGameName?: string;
  gameName: string;
  preparation: GameAssetPreparationStatus;
  disabled?: boolean;
  label?: string;
  onChange(game: StartggVideogame): void;
};

export function GameSelect({
  tournamentLoaded,
  eventGameName,
  gameName,
  preparation,
  disabled,
  label: inputLabel,
  onChange
}: GameSelectProps) {
  const { t, i18n } = useTranslation('operator');
  const [games, setGames] = useState<StartggVideogame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [cached, setCached] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const label = (game: StartggVideogame) => game.name || t('generators.unnamedGame', { id: game.id });
  const options = useMemo(
    () => sortByLabel(games, (game) => game.name, locale).map((game) => ({ value: game.id, label: label(game) })),
    [games, locale, t]
  );
  const selected =
    games.find((game) => {
      if (game.id !== selectedId) return false;
      const matchesName = game.name === gameName;
      const matchesUnnamedGame = !game.name && gameName.endsWith(game.id);
      return matchesName || matchesUnnamedGame;
    }) ?? games.find((game) => label(game) === gameName);
  const selectOptions = useMemo(
    () => (selected || !gameName ? options : [{ value: '__current__', label: gameName }, ...options]),
    [selected, options, gameName]
  );

  async function openCatalog() {
    if (loading || games.length) return;
    setLoading(true);
    setError(undefined);
    try {
      const result = await loadGameCatalog();
      setGames(result.games);
      setCached(result.cached);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('generators.gamesFailed'));
    } finally {
      setLoading(false);
    }
  }

  let description: string | undefined;
  if (preparation.loading) description = t('generators.preparingCharacters');
  else if (preparation.rosterAvailable === false) description = t('generators.noCharacterRoster');
  else if (preparation.rosterAvailable) description = t('generators.characterFileGuides');
  else if (cached) description = t('generators.cachedGames');

  if (tournamentLoaded)
    return (
      <TextInput
        label={inputLabel ?? t('generators.game')}
        value={eventGameName ?? ''}
        placeholder={t('generators.selectEvent')}
        readOnly
        description={description}
        inputWrapperOrder={['label', 'input', 'description', 'error']}
        error={preparation.error}
      />
    );

  return (
    <Select
      label={inputLabel ?? t('generators.game')}
      placeholder={t('generators.selectGame')}
      value={selected?.id ?? (gameName ? '__current__' : null)}
      disabled={disabled}
      data={selectOptions}
      searchable
      allowDeselect={false}
      nothingFoundMessage={loading ? t('generators.loadingGames') : t('generators.noGames')}
      rightSection={loading ? <Loader size="xs" /> : undefined}
      error={error ?? preparation.error}
      description={description}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      onDropdownOpen={() => void openCatalog()}
      onChange={(id) => {
        const game = games.find((game) => game.id === id);
        if (game) {
          setSelectedId(game.id);
          onChange(game);
        }
      }}
    />
  );
}
