import {
  Badge,
  ActionIcon,
  Group,
  Loader,
  Pagination,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { playerLabel, type LibraryPlayer } from '@shared/playerLibrary';
import { displayFlagLabel, displayFlagUrl } from '../overlayPlayerPresentation';
import { PanelHeader } from '../PanelHeader';
import { OperatorIcon, UsersIcon, MagnifyingGlassIcon, PlusIcon } from '../icons';

type Props = {
  query: string;
  page: number;
  total: number;
  libraryTotal?: number;
  players: LibraryPlayer[];
  selectedId?: string;
  busy: boolean;
  loading: boolean;
  onQuery(value: string): void;
  onPage(value: number): void;
  onSelect(player: LibraryPlayer): void;
  onCreate(): void;
};
export function PlayerLibraryList({
  query,
  page,
  total,
  libraryTotal,
  players,
  selectedId,
  busy,
  loading,
  onQuery,
  onPage,
  onSelect,
  onCreate
}: Props) {
  const { t } = useTranslation('operator');
  return (
    <aside className="player-library-list operator-inset">
      <Stack gap="xs" p="md">
        <PanelHeader title={t('players.title')} icon={UsersIcon} order={3} inset="md">
          <Group gap="xs" wrap="nowrap">
            {loading && <Loader size="xs" />}
            <ActionIcon
              size={26}
              variant="default"
              data-tutorial="player-library-create"
              aria-label={t('players.add')}
              title={t('players.add')}
              disabled={busy}
              onClick={onCreate}
            >
              <OperatorIcon icon={PlusIcon} />
            </ActionIcon>
          </Group>
        </PanelHeader>
        <TextInput
          aria-label={t('players.search')}
          leftSection={<OperatorIcon icon={MagnifyingGlassIcon} />}
          placeholder={t('players.searchPlaceholder')}
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
        />
        {libraryTotal !== undefined && (
          <Text className="player-library-count" size="xs" c="dimmed" ta="center">
            {t('players.count', { count: libraryTotal })}
          </Text>
        )}
      </Stack>
      <ScrollArea className="player-library-list-scroll" type="auto" offsetScrollbars>
        <Stack gap={4} px="xs" pb="sm">
          {players.map((player) => {
            const country = player.overrides.country ?? player.imported.country ?? undefined;
            const flag = displayFlagUrl(country, player.overrides.displayFlag || undefined);
            const prefix = player.overrides.prefix ?? player.imported.prefix;
            return (
              <UnstyledButton
                className="player-library-row"
                key={player.localId}
                disabled={busy}
                data-selected={player.localId === selectedId || undefined}
                aria-pressed={player.localId === selectedId}
                onClick={() => onSelect(player)}
              >
                <Group gap="sm" wrap="nowrap">
                  <div className="player-library-flag">
                    <img src={flag} alt={displayFlagLabel(country, player.overrides.displayFlag || undefined)} />
                  </div>
                  <div className="player-library-row-details">
                    <Text fw={700} size="sm" truncate>
                      {playerLabel(player)}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {prefix ? `${prefix} · ` : ''}
                      {player.playerId ? `start.gg #${player.playerId}` : t('players.localPlayer')}
                    </Text>
                  </div>
                  {player.games.length > 0 && (
                    <Badge
                      variant="outline"
                      size="xs"
                      aria-label={t('players.gameCount', { count: player.games.length })}
                    >
                      {t('players.gameCount', { count: player.games.length })}
                    </Badge>
                  )}
                </Group>
              </UnstyledButton>
            );
          })}
          {!players.length && !loading && (
            <Text size="sm" c="dimmed" p="md">
              {t(query ? 'players.noMatches' : 'players.emptyLibrary')}
            </Text>
          )}
        </Stack>
      </ScrollArea>
      {total > 50 && (
        <Group justify="center" p="sm" className="player-library-pagination">
          <Pagination
            size="sm"
            total={Math.ceil(total / 50)}
            value={page}
            onChange={onPage}
            disabled={busy}
            siblings={0}
          />
        </Group>
      )}
    </aside>
  );
}
