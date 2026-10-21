import { Combobox, TextInput, useCombobox, type TextInputProps } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playerLabel, presentationFields, type LibraryPlayer } from '@shared/playerLibrary';
import { api } from '../../api';

type Props = Omit<TextInputProps, 'value' | 'onChange'> & {
  value: string;
  gameKey: string;
  onCommit(name: string): void;
  onSelectPlayer(player: ReturnType<typeof presentationFields>): void;
};
/** Search is optional: typing an unsaved name still works, including while offline. */
export function PlayerNameInput({ value, gameKey, onCommit, onSelectPlayer, ...props }: Props) {
  const { t } = useTranslation('operator');
  const [text, setText] = useState(value);
  const [results, setResults] = useState<LibraryPlayer[]>([]);
  const [error, setError] = useState<string>();
  const [focused, setFocused] = useState(false);
  const picking = useRef(false);
  const selectionRequest = useRef(0);
  useEffect(
    () => () => {
      selectionRequest.current++;
    },
    []
  );
  const latest = useRef({ onCommit, onSelectPlayer, text, gameKey });
  latest.current = { onCommit, onSelectPlayer, text, gameKey };
  const combobox = useCombobox();
  useEffect(() => {
    setText(value);
  }, [value]);
  useEffect(() => {
    let active = true;
    if (!focused || !text.trim()) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api
        .searchPlayers(text)
        .then(({ players }) => {
          if (active) setResults(players.slice(0, 10));
        })
        .catch(() => {
          if (active) setResults([]);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [text, focused]);
  useEffect(() => {
    if (text === value) return;
    const timer = window.setTimeout(() => {
      if (!picking.current) latest.current.onCommit(text);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [text, value]);
  async function select(id: string) {
    const request = ++selectionRequest.current;
    picking.current = true;
    const requestText = latest.current.text;
    const requestGame = gameKey;
    combobox.closeDropdown();
    try {
      const [player] = await api.resolvePlayers([{ localPlayerId: id }], gameKey);
      if (
        request === selectionRequest.current &&
        player &&
        latest.current.text === requestText &&
        latest.current.gameKey === requestGame
      ) {
        setText(player.name);
        latest.current.onSelectPlayer(presentationFields(player));
        setError(undefined);
      }
    } catch {
      if (request === selectionRequest.current) setError(t('players.loadFailed'));
    } finally {
      if (request === selectionRequest.current) picking.current = false;
    }
  }
  return (
    <Combobox store={combobox} onOptionSubmit={(id) => void select(id)}>
      <Combobox.Target>
        <TextInput
          {...props}
          error={error}
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => {
            setFocused(true);
            combobox.openDropdown();
          }}
          onBlur={() => {
            setFocused(false);
            combobox.closeDropdown();
            if (!picking.current && text !== value) onCommit(text);
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={!results.length}>
        <Combobox.Options>
          {results.map((player) => (
            <Combobox.Option key={player.localId} value={player.localId}>
              {playerLabel(player)} · {player.overrides.country ?? player.imported.country ?? '—'} ·{' '}
              {player.playerId ? `start.gg #${player.playerId}` : player.localId.slice(0, 8)}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
