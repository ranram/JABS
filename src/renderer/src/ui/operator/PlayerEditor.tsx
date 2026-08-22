import { MultiSelect, NumberInput, Select } from '@mantine/core';
import type { GameProfile } from '@shared/gameProfiles';
import type { CountryOption, SelectedSetState } from '@shared/models';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { emptyToUndefined, sortByLabel } from './operatorUtils';
import { BufferedTextInput } from './BufferedTextInput';
import { characterTeamSelection } from '@shared/characterTeams';
import { DisplayFlagSelect } from './DisplayFlagSelect';

type PlayerEditorProps = {
  side: 'one' | 'two';
  title: string;
  player: SelectedSetState['playerOne'];
  countries: CountryOption[];
  characters: readonly string[];
  maxCharacters: number;
  editableFields: GameProfile['editableFields'];
  onChange(player: SelectedSetState['playerOne']): void;
};

export const PlayerEditor = memo(function PlayerEditor(props: PlayerEditorProps) {
  const { side, title, player, countries, characters, maxCharacters, editableFields, onChange } = props;
  const { t, i18n } = useTranslation('operator');
  const [states, setStates] = useState<Array<{ code: string; name: string }>>([]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const hasField = (...fields: GameProfile['editableFields']) =>
    fields.some((field) => editableFields.includes(field));

  useEffect(() => {
    let active = true;
    if (!player.country) {
      setStates([]);
      return () => { active = false; };
    }
    void api.states(player.country).then(
      (response) => { if (active) setStates(response.states); },
      () => { if (active) setStates([]); }
    );
    return () => { active = false; };
  }, [player.country]);

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
  const stateData = useMemo(
    () => sortByLabel(states, (state) => state.name, locale).map((state) => ({ value: state.code, label: state.name })),
    [states, locale]
  );

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
            onChange={(nextCharacters) => onChange({ ...player, ...characterTeamSelection(nextCharacters) })}
          />
        )}
        {hasField('team', 'sponsor') && (
          <BufferedTextInput
            data-stream-free-text={side === 'one' ? 'playerOneSponsor' : 'playerTwoSponsor'}
            data-testid={`editor-${side}-sponsor`}
            label={t('editor.sponsor')}
            value={player.sponsor ?? ''}
            onCommit={(value) => onChange({ ...player, sponsor: emptyToUndefined(value) })}
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
        {hasField('state') && (
          <Select
            searchable
            clearable
            data-testid={`editor-${side}-state`}
            label={t('editor.state')}
            placeholder={player.country ? t('editor.notShown') : t('editor.chooseCountryFirst')}
            disabled={!player.country || states.length === 0}
            data={stateData}
            value={player.state ?? null}
            onChange={(state) => onChange({ ...player, state: state ?? undefined })}
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
  && previous.maxCharacters === next.maxCharacters
  && previous.editableFields === next.editableFields
));
