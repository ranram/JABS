import { Alert, Button, FileButton, Group, Modal, ScrollArea, Text, Badge, Paper, Title } from '@mantine/core';
import { useTutorialActive } from '../tutorials/tutorialActivity';
import { DestructiveButton } from '../DestructiveButton';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { libraryPlayerSchema, playerLabel, type LibraryPlayer } from '@shared/playerLibrary';
import type { PlayerState, SelectedSetState } from '@shared/models';
import { z } from 'zod';
import { api } from '../../api';
import { PlayerLibraryEditor } from './PlayerLibraryEditor';
import { PlayerLibraryList } from './PlayerLibraryList';
import { PlayerProfileLookup } from './PlayerProfileLookup';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';
import {
  OperatorIcon,
  UserIcon,
  PlusIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  TrashSimpleIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  ArrowsClockwiseIcon,
  XIcon
} from '../icons';
import { PanelHeader } from '../PanelHeader';
import './playerLibrary.css';

function newPlayer(name = ''): LibraryPlayer {
  return {
    localId: crypto.randomUUID().replaceAll('-', ''),
    playerId: null,
    imported: { name, prefix: null, pronouns: null, xHandle: null, country: null, state: null, profileSlug: null },
    overrides: {},
    aliases: [],
    games: [],
    updatedAt: '',
    seenAt: ''
  };
}
const archiveSchema = z
  .object({
    format: z.literal('jabs-players'),
    version: z.literal(1),
    players: z.array(libraryPlayerSchema).max(100_000)
  })
  .strict();

export function PlayerLibraryDialog({
  selectedSet,
  opened,
  onClose
}: {
  selectedSet?: SelectedSetState;
  opened: boolean;
  onClose(): void;
}) {
  const { t } = useTranslation('operator');
  const tutorialActive = useTutorialActive();
  const requestClose = useRef(onClose);
  return (
    <Modal
      opened={opened}
      onClose={() => requestClose.current()}
      title={t('players.title')}
      size="min(1440px, 96vw)"
      yOffset="3vh"
      xOffset="2vw"
      classNames={{
        content: 'player-library-modal',
        header: 'player-library-modal-header',
        body: 'player-library-modal-body'
      }}
      closeOnClickOutside={false}
      trapFocus={!tutorialActive}
      closeOnEscape={!tutorialActive}
    >
      {opened && <PlayerLibraryPanel selectedSet={selectedSet} requestClose={requestClose} closeModal={onClose} />}
    </Modal>
  );
}
function PlayerLibraryPanel({
  selectedSet,
  requestClose,
  closeModal
}: {
  selectedSet?: SelectedSetState;
  requestClose: { current: () => void };
  closeModal(): void;
}) {
  const { t, i18n } = useTranslation('operator');
  const notify = useOperatorNotifications();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<LibraryPlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [libraryTotal, setLibraryTotal] = useState<number>();
  const libraryTotalRevision = useRef(-1);
  const [revision, setRevision] = useState(0);
  const [player, setPlayer] = useState<LibraryPlayer>();
  const [savedPlayerSnapshot, setSavedPlayerSnapshot] = useState('');
  const [pendingChange, setPendingChange] = useState<{ proceed(): void }>();
  const [searching, setSearching] = useState(true);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = Boolean(player && JSON.stringify(player) !== savedPlayerSnapshot);
  function beginEditing(record: LibraryPlayer) {
    setSavedPlayerSnapshot(JSON.stringify(record));
    setPlayer(record);
    setConfirmDelete(false);
    setPendingChange(undefined);
  }
  function changeEditor(proceed: () => void) {
    if (busy) return;
    if (dirty) setPendingChange({ proceed });
    else proceed();
  }
  function closePlayer() {
    setPlayer(undefined);
    setSavedPlayerSnapshot('');
    setConfirmDelete(false);
    setPendingChange(undefined);
  }
  async function savePlayer() {
    if (!player) return;
    setSaving(true);
    try {
      const saved = await api.saveLibraryPlayer(player);
      beginEditing(saved.player);
      if (saved.warnings.length) {
        const labels = [
          ...new Set(
            saved.warnings.map(({ field }) => {
              if (field === 'aliases') return t('players.aliases');
              if (field === 'characters') return t('players.characters');
              return t(`players.fields.${field}`);
            })
          )
        ];
        const fields = new Intl.ListFormat(i18n.resolvedLanguage ?? i18n.language, {
          style: 'long',
          type: 'conjunction'
        }).format(labels);
        notify(t('players.savedWithModeration', { fields }), 'warning');
      } else notify(t('players.saved'), 'success');
    } finally {
      setSaving(false);
    }
  }
  // Closing the modal uses the same unsaved-change check as switching players.
  useEffect(() => {
    requestClose.current = () => changeEditor(closeModal);
    return () => {
      requestClose.current = closeModal;
    };
  }, [dirty, busy, closeModal, requestClose]);
  useEffect(() => {
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api
        .searchPlayers(query, (page - 1) * 50)
        .then(async (result) => {
          if (!active) return;
          // Filtering changes the result count, not the number of saved players.
          const registered = query.trim()
            ? libraryTotalRevision.current === revision
              ? undefined
              : (await api.searchPlayers()).total
            : result.total;
          if (active) {
            if (registered !== undefined) {
              setLibraryTotal(registered);
              libraryTotalRevision.current = revision;
            }
            setResults(result.players);
            setTotal(result.total);
            const lastPage = Math.max(1, Math.ceil(result.total / 50));
            if (page > lastPage) setPage(lastPage);
            setSearching(false);
          }
        })
        .catch((error) => {
          if (active) {
            notify(error instanceof Error ? error.message : t('players.searchFailed'), 'error');
            setSearching(false);
          }
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, page, revision, notify, t]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      setRevision((n) => n + 1);
      return true;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message === 'players.blockedTag'
            ? t('players.blockedTag')
            : error.message
          : t('players.actionFailed'),
        'error'
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function findPlayer(reference: string) {
    setLookingUp(true);
    try {
      const result = await api.lookupLibraryPlayer(reference);
      beginEditing(result.player);
      notify(
        t(result.source === 'local' ? 'players.lookupSaved' : 'players.lookupImported', {
          name: playerLabel(result.player)
        }),
        result.source === 'local' ? 'info' : 'success'
      );
    } finally {
      setLookingUp(false);
    }
  }
  async function fromStream(subject: PlayerState) {
    if (!selectedSet) return;
    const gameKey = selectedSet.assetCatalogSlug ?? selectedSet.gameId;
    const [resolved] = await api.resolvePlayers(
      [{ localPlayerId: subject.localPlayerId, playerId: subject.playerId }],
      gameKey
    );
    if (resolved) {
      beginEditing(await api.libraryPlayer(resolved.localPlayerId));
      return;
    }
    const record = newPlayer(subject.name);
    record.playerId = subject.playerId ?? null;
    const games = record.games.filter((game) => game.gameKey !== gameKey);
    games.push({
      gameKey,
      characters: subject.characters ?? (subject.character ? [subject.character] : []),
      characterAssetId: subject.characterAssetId ?? null,
      portraitAssetId: subject.portraitAssetId ?? null
    });
    setSavedPlayerSnapshot(JSON.stringify(record));
    setConfirmDelete(false);
    setPendingChange(undefined);
    setPlayer({
      ...record,
      games,
      overrides: {
        ...record.overrides,
        name: subject.name,
        prefix: subject.sponsor ?? subject.prefix ?? '',
        xHandle: subject.xHandle ?? '',
        pronouns: subject.pronouns ?? '',
        country: subject.country ?? '',
        state: subject.state ?? '',
        displayFlag: subject.displayFlag ?? '',
        playerPhotoAssetId: subject.playerPhotoAssetId ?? record.overrides.playerPhotoAssetId ?? ''
      }
    });
  }
  async function exportPlayers() {
    const all: LibraryPlayer[] = [];
    for (let offset = 0; ; offset += 50) {
      const result = await api.searchPlayers('', offset);
      all.push(...result.players);
      if (offset + 50 >= result.total) break;
    }
    const filename = 'jabs-players.json';
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ format: 'jabs-players', version: 1, players: all }, null, 2)], {
        type: 'application/json'
      })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(t('messages.exportCompleted', { filename }), 'success');
  }
  async function importFile(file: File) {
    if (file.size > 50_000_000) throw new Error(t('players.fileTooLarge'));
    const archive = archiveSchema.parse(JSON.parse(await file.text()));
    let added = 0;
    let skipped = 0;
    for (let offset = 0; offset < archive.players.length; offset += 200) {
      const result = await api.importPlayerLibrary(archive.players.slice(offset, offset + 200));
      added += result.added;
      skipped += result.skipped;
    }
    notify(t('players.fileImported', { added, skipped }), 'success');
  }
  return (
    <div className="player-library-panel">
      <div className="player-library-toolbar">
        <PlayerProfileLookup
          disabled={busy}
          loading={lookingUp}
          onLookup={(reference) => changeEditor(() => void action(() => findPlayer(reference)))}
          actions={
            <Group className="player-library-file-actions" gap="xs" wrap="nowrap">
              <Button
                leftSection={<OperatorIcon icon={DownloadSimpleIcon} />}
                variant="default"
                disabled={busy}
                onClick={() => void action(exportPlayers)}
              >
                {t('players.export')}
              </Button>
              <FileButton accept="application/json" onChange={(file) => file && void action(() => importFile(file))}>
                {(props) => (
                  <Button
                    {...props}
                    leftSection={<OperatorIcon icon={UploadSimpleIcon} />}
                    variant="default"
                    disabled={busy}
                  >
                    {t('players.importFile')}
                  </Button>
                )}
              </FileButton>
            </Group>
          }
        />
      </div>
      {selectedSet && (
        <Group gap="xs" className="player-library-stream-choices">
          <Text size="xs" c="dimmed">
            {t('players.onStream')}
          </Text>
          {[selectedSet.playerOne, selectedSet.playerTwo].map((subject, index) => (
            <Button
              key={index}
              size="compact-sm"
              variant="light"
              disabled={busy}
              leftSection={<OperatorIcon icon={UserIcon} size={14} />}
              aria-label={t('players.fromStream', { name: subject.name })}
              onClick={() => changeEditor(() => void action(() => fromStream(subject)))}
            >
              {subject.name}
            </Button>
          ))}
        </Group>
      )}
      {pendingChange && (
        <Alert color="yellow" title={t('players.unsavedTitle')}>
          <Text size="sm">{t('players.unsavedHelp')}</Text>
          <Group className="player-library-confirm-actions" mt="sm" gap="sm" grow>
            <Button
              size="sm"
              leftSection={<OperatorIcon icon={FloppyDiskIcon} />}
              disabled={busy}
              onClick={() =>
                void action(savePlayer).then((saved) => {
                  if (saved) pendingChange.proceed();
                })
              }
            >
              {t('players.saveContinue')}
            </Button>
            <DestructiveButton
              size="sm"
              leftSection={<OperatorIcon icon={TrashSimpleIcon} />}
              disabled={busy}
              onClick={() => {
                pendingChange.proceed();
                setPendingChange(undefined);
              }}
            >
              {t('players.discardContinue')}
            </DestructiveButton>
            <Button
              size="sm"
              variant="default"
              leftSection={<OperatorIcon icon={PencilSimpleIcon} />}
              disabled={busy}
              onClick={() => setPendingChange(undefined)}
            >
              {t('players.keepEditing')}
            </Button>
          </Group>
        </Alert>
      )}
      <div className="player-library-workspace">
        <PlayerLibraryList
          onCreate={() => changeEditor(() => beginEditing(newPlayer()))}
          query={query}
          page={page}
          total={total}
          libraryTotal={libraryTotal}
          players={results}
          selectedId={player?.localId}
          busy={busy}
          loading={searching}
          onQuery={(value) => {
            setQuery(value);
            setPage(1);
          }}
          onPage={setPage}
          onSelect={(record) => {
            if (record.localId !== player?.localId) changeEditor(() => beginEditing(record));
          }}
        />
        {player ? (
          <section className="player-library-detail operator-inset">
            <PanelHeader
              className="player-library-detail-header"
              title={playerLabel(player) || t('players.newPlayer')}
              description={player.playerId ? `start.gg #${player.playerId}` : t('players.localPlayer')}
              icon={UserIcon}
              order={3}
              size="h3"
            >
              <Group gap="xs" wrap="wrap" align="center">
                {dirty && (
                  <Badge color="yellow" variant="light" size="sm">
                    {t('players.unsaved')}
                  </Badge>
                )}
                <DestructiveButton
                  aria-label={t('players.closePlayer')}
                  size="compact-sm"
                  w={30}
                  h={30}
                  p={0}
                  disabled={busy}
                  onClick={() => changeEditor(closePlayer)}
                >
                  <OperatorIcon icon={XIcon} />
                </DestructiveButton>
              </Group>
            </PanelHeader>
            <ScrollArea className="player-library-detail-scroll" type="auto" offsetScrollbars>
              <fieldset className="player-library-form" disabled={busy}>
                <PlayerLibraryEditor
                  key={player.localId}
                  player={player}
                  selectedSet={selectedSet}
                  onChange={(next) => {
                    setPlayer(next);
                    setConfirmDelete(false);
                  }}
                />
              </fieldset>
            </ScrollArea>
            <Group className="player-library-detail-actions" justify="space-between">
              <Group gap="xs">
                <Button
                  leftSection={<OperatorIcon icon={FloppyDiskIcon} />}
                  loading={saving}
                  disabled={busy || !dirty}
                  onClick={() => void action(savePlayer)}
                >
                  {t('players.save')}
                </Button>
                <Button
                  variant="default"
                  leftSection={<OperatorIcon icon={ArrowsClockwiseIcon} />}
                  disabled={busy || !player.seenAt}
                  onClick={() =>
                    changeEditor(() => void action(async () => beginEditing(await api.libraryPlayer(player.localId))))
                  }
                >
                  {t('players.reload')}
                </Button>
              </Group>
              <Group gap="xs">
                {confirmDelete && (
                  <Button
                    leftSection={<OperatorIcon icon={XIcon} />}
                    variant="default"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t('players.cancelDelete')}
                  </Button>
                )}
                <DestructiveButton
                  leftSection={<OperatorIcon icon={TrashSimpleIcon} />}
                  disabled={busy || !player.seenAt}
                  onClick={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    void action(async () => {
                      await api.deleteLibraryPlayer(player);
                      closePlayer();
                      notify(t('players.deleted'), 'success');
                    });
                  }}
                >
                  {t(confirmDelete ? 'players.confirmDelete' : 'players.delete')}
                </DestructiveButton>
              </Group>
            </Group>
          </section>
        ) : (
          <Paper className="player-library-empty operator-inset" p="xl" withBorder>
            <Title order={3}>{t('players.choosePlayer')}</Title>
            <Text c="dimmed" size="sm" maw={360}>
              {t('players.choosePlayerHelp')}
            </Text>
            <Button
              leftSection={<OperatorIcon icon={PlusIcon} />}
              variant="light"
              disabled={busy}
              onClick={() => beginEditing(newPlayer())}
            >
              {t('players.add')}
            </Button>
          </Paper>
        )}
      </div>
    </div>
  );
}
