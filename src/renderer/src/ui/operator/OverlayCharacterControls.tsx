import { useMemo } from 'react';
import { SimpleGrid } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { characterTeamSelection, maxCharactersForGame, playerCharacters } from '@shared/characterTeams';
import type { PlayerState, SelectedSetState } from '@shared/models';
import { CharacterSelect } from './CharacterSelect';
import { CharacterOutfitSelect } from './CharacterOutfitSelect';
import type { CharacterCatalogOptions } from './useCharacterCatalogOptions';
import { sortByLabel } from './operatorUtils';

export function OverlayCharacterControls({
  activeSet,
  catalog,
  onPatch
}: {
  activeSet: SelectedSetState;
  catalog: CharacterCatalogOptions;
  onPatch(patch: Partial<SelectedSetState>): void;
}) {
  const { t, i18n } = useTranslation('operator');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const characters = useMemo(
    () => sortByLabel(catalog.characters, (character) => character, locale).map((value) => ({ value, label: value })),
    [catalog.characters, locale]
  );
  const maxCharacters = maxCharactersForGame(activeSet.assetCatalogSlug ?? activeSet.gameId);
  function changePlayer(side: 'playerOne' | 'playerTwo', patch: Partial<PlayerState>) {
    onPatch({ [side]: { ...activeSet[side], ...patch } });
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {(['playerOne', 'playerTwo'] as const).map((side) => {
        const player = activeSet[side];
        const selected = playerCharacters(player);
        const unavailable = selected
          .filter((value) => !catalog.characters.includes(value))
          .map((value) => ({ value, label: t('editor.unavailableCharacter', { character: value }) }));
        return (
          <div className="overlay-character-player" key={side}>
            <CharacterSelect
              data-testid={`overlay-${side}-character`}
              label={`${t(`editor.${side}`)} · ${player.name}`}
              data={[...unavailable, ...characters]}
              value={selected}
              maxValues={maxCharacters}
              onChange={(values) => changePlayer(side, characterTeamSelection(values, player))}
            />
            <CharacterOutfitSelect
              testId={`overlay-${side}-outfit`}
              subject={player}
              assets={catalog.assets}
              onChange={(characterAssetId) => changePlayer(side, { characterAssetId })}
            />
          </div>
        );
      })}
    </SimpleGrid>
  );
}
