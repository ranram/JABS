import { MultiSelect, NumberInput } from '@mantine/core';
import type { GameProfile } from '@shared/gameProfiles';
import type { CountryOption, GameCharacterAsset, SelectedSetState } from '@shared/models';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { emptyToUndefined, sortByLabel } from './operatorUtils';
import { BufferedTextInput } from './BufferedTextInput';
import { characterTeamSelection } from '@shared/characterTeams';
import { DisplayFlagSelect } from './DisplayFlagSelect';
import { CharacterOutfitSelect } from './CharacterOutfitSelect';

function normalizeXHandle(value: string): string {
  return value.trim().replace(/^@+/, '').trim();
}

type PlayerEditorProps = {
  side: 'one' | 'two';
  title: string;
  player: SelectedSetState['playerOne'];
  countries: CountryOption[];
  characters: readonly string[];
  characterAssets: readonly GameCharacterAsset[];
  maxCharacters: number;
  editableFields: GameProfile['editableFields'];
  onChange(player: SelectedSetState['playerOne']): void;
};

export const PlayerEditor = memo(function PlayerEditor(props: PlayerEditorProps) {
  const {
    side, title, player, countries, characters, characterAssets,
    maxCharacters, editableFields, onChange
  } = props;
  const { t, i18n } = useTranslation('operator');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const hasField = (...fields: GameProfile['editableFields']) =>
    fields.some((field) => editableFields.includes(field));

  const characterData = useMemo(
    () => sortByLabel(characters, (character) => character, locale).map((value) => ({ value, label: value })),
    [characters, locale]
  );
  const selectedCharacters = player.characters?.length
    ? player.characters
    : player.character ? [player.character] : [];
  const unavailableCharacters = selectedCharacters.filter((character) => !characters.includes(character));
  const visibleCharacterData = [
    ...unavailableCharacters.map((character) => ({
      value: character,
      label: t('editor.unavailableCharacter', { character })
    })),
    ...characterData
  ];

  return (
    <fieldset className="player-editor">
      <legend>{title}</legend>
      <div className="player-field-row">
        <BufferedTextInput
          data-stream-free-text={side === 'one' ? 'playerOneName' : 'playerTwoName'}
          data-testid={`editor-${side}-name`}
          label={t('editor.playerTag')}
          value={player.name}
          onCommit={(name) => onChange({ ...player, name })}
        />
        <BufferedTextInput
          data-stream-free-text={side === 'one' ? 'playerOnePrefix' : 'playerTwoPrefix'}
          data-testid={`editor-${side}-prefix`}
          label={t('editor.prefix')}
          value={player.prefix ?? ''}
          onCommit={(value) => onChange({ ...player, prefix: emptyToUndefined(value) })}
        />
      </div>
      <div className="player-field-row">
        {hasField('character') && (
          <MultiSelect
            searchable
            clearable
            data-testid={`editor-${side}-character`}
            label={t('editor.characters')}
            data={visibleCharacterData}
            value={selectedCharacters}
            maxValues={maxCharacters}
            onChange={(nextCharacters) => onChange({
              ...player,
              ...characterTeamSelection(nextCharacters, player)
            })}
          />
        )}
        {hasField('character') && (
          <CharacterOutfitSelect
            subject={player}
            assets={characterAssets}
            testId={`editor-${side}-character-outfit`}
            onChange={(characterAssetId) => onChange({ ...player, characterAssetId })}
          />
        )}
      </div>
      <div className="player-field-row">
        {hasField('country') && (
          <DisplayFlagSelect
            testId={`editor-${side}-country`}
            label={t('editor.displayFlag')}
            placeholder={t('editor.countrySearch')}
            countries={countries}
            country={player.country}
            displayFlag={player.displayFlag}
            onChange={({ country, displayFlag }) => onChange({
              ...player,
              country,
              displayFlag,
              state: country === player.country ? player.state : undefined
            })}
          />
        )}
        {hasField('xHandle') && (
          <BufferedTextInput
            data-stream-free-text={side === 'one' ? 'playerOneXHandle' : 'playerTwoXHandle'}
            data-testid={`editor-${side}-x-handle`}
            label={t('editor.xHandle')}
            value={player.xHandle ?? ''}
            onCommit={(value) => onChange({ ...player, xHandle: emptyToUndefined(normalizeXHandle(value)) })}
          />
        )}
      </div>
      <div className="player-field-row">
        {hasField('pronouns') && (
          <BufferedTextInput
            data-stream-free-text={side === 'one' ? 'playerOnePronouns' : 'playerTwoPronouns'}
            data-testid={`editor-${side}-pronouns`}
            label={t('editor.pronouns')}
            value={player.pronouns ?? ''}
            onCommit={(value) => onChange({ ...player, pronouns: emptyToUndefined(value) })}
          />
        )}
        {hasField('seed') && (
          <NumberInput
            data-testid={`editor-${side}-seed`}
            label={t('editor.seed')}
            min={1}
            value={player.seed ?? ''}
            onChange={(seed) => onChange({ ...player, seed: typeof seed === 'number' ? seed : undefined })}
          />
        )}
      </div>
    </fieldset>
  );
}, (previous, next) => (
  previous.side === next.side
  && previous.title === next.title
  && previous.player === next.player
  && previous.countries === next.countries
  && previous.characters === next.characters
  && previous.characterAssets === next.characterAssets
  && previous.maxCharacters === next.maxCharacters
  && previous.editableFields === next.editableFields
));