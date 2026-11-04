import { Combobox, Loader, TextInput, useCombobox, type TextInputProps } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playerLabel, presentationFields, type LibraryPlayer } from '@shared/playerLibrary';
import { api } from '../../api';

const SEARCH_DELAY_MS = 250;
const NAME_COMMIT_DELAY_MS = 1500;
const MAX_SEARCH_RESULTS = 10;

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
  const [resolvingPlayer, setResolvingPlayer] = useState(false);
  const focusedRef = useRef(false);
  const commitTimer = useRef<number | undefined>(undefined);
  const lastCommittedName = useRef(value);
  // Blur can fire before React renders the loading state, so it also needs an immediate guard.
  const selectionPending = useRef(false);
  const selectionVersion = useRef(0);
  const latest = useRef({ onCommit, onSelectPlayer, text, gameKey, value });
  latest.current = { onCommit, onSelectPlayer, text, gameKey, value };
  function clearCommitTimer() {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = undefined;
  }
  function cancelSelection() {
    selectionVersion.current++;
    selectionPending.current = false;
    clearCommitTimer();
    setResolvingPlayer(false);
    setError(undefined);
  }
  function updateText(nextText: string) {
    latest.current.text = nextText;
    setText(nextText);
  }
  function commitName() {
    clearCommitTimer();
    const current = latest.current;
    if (selectionPending.current || current.text === current.value || current.text === lastCommittedName.current)
      return;
    lastCommittedName.current = current.text;
    current.onCommit(current.text);
  }
  useEffect(() => {
    cancelSelection();
    return () => {
      selectionVersion.current++;
      clearCommitTimer();
    };
  }, [gameKey]);
  const combobox = useCombobox();
  useEffect(() => {
    // Save responses can arrive after typing or selection has started.
    if (!focusedRef.current && !selectionPending.current) {
      lastCommittedName.current = value;
      updateText(value);
    }
  }, [value]);
  useEffect(() => {
    let active = true;
    if (!focused || !combobox.dropdownOpened || resolvingPlayer || !text.trim()) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api
        .searchPlayers(text)
        .then(({ players }) => {
          if (active) setResults(players.slice(0, MAX_SEARCH_RESULTS));
        })
        .catch(() => {
          if (active) setResults([]);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [text, focused, resolvingPlayer, combobox.dropdownOpened]);
  useEffect(() => {
    clearCommitTimer();
    if (text === value || text === lastCommittedName.current || resolvingPlayer || props.disabled || props.readOnly)
      return;
    commitTimer.current = window.setTimeout(() => {
      if (latest.current.text === text) commitName();
    }, NAME_COMMIT_DELAY_MS);
    return clearCommitTimer;
  }, [text, value, resolvingPlayer, gameKey, props.disabled, props.readOnly]);
  async function selectPlayer(localPlayerId: string) {
    if (props.disabled || props.readOnly) return;
    const requestVersion = ++selectionVersion.current;
    selectionPending.current = true;
    clearCommitTimer();
    setResolvingPlayer(true);
    setError(undefined);
    const requestGame = gameKey;
    const isCurrentSelection = () =>
      requestVersion === selectionVersion.current && latest.current.gameKey === requestGame;
    combobox.closeDropdown();
    try {
      const [player] = await api.resolvePlayers([{ localPlayerId }], requestGame);
      if (!isCurrentSelection()) return;
      if (!player) {
        setError(t('players.loadFailed'));
        return;
      }
      // Blur and idle saves must not turn this selected profile back into a typed name.
      lastCommittedName.current = player.name;
      updateText(player.name);
      latest.current.onSelectPlayer(presentationFields(player));
    } catch {
      if (isCurrentSelection()) setError(t('players.loadFailed'));
    } finally {
      if (isCurrentSelection()) {
        selectionPending.current = false;
        setResolvingPlayer(false);
      }
    }
  }
  return (
    <Combobox store={combobox} onOptionSubmit={(id) => void selectPlayer(id)}>
      <Combobox.Target>
        <TextInput
          {...props}
          error={error}
          aria-busy={resolvingPlayer || undefined}
          rightSection={resolvingPlayer ? <Loader size="xs" /> : props.rightSection}
          value={text}
          onChange={(event) => {
            cancelSelection();
            updateText(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => {
            focusedRef.current = true;
            setFocused(true);
            combobox.openDropdown();
          }}
          onBlur={() => {
            focusedRef.current = false;
            setFocused(false);
            combobox.closeDropdown();
            commitName();
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
