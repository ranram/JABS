import { memo, useEffect, useMemo, useRef } from 'react';
import { Badge, Box, Button, Center, Group, Loader, Paper, Progress, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type {
  SetSummary,
  StartggPageInfo,
  StartggSetScope,
  StartggStreamAssignment
} from '@shared/models';
import { setPhaseContext, setStatusTone } from './operatorUtils';

type SetSelectorPanelProps = {
  sets: SetSummary[];
  visibleSets: SetSummary[];
  assignments: StartggStreamAssignment[];
  scope?: StartggSetScope;
  scopeLabel: string;
  pageInfo?: StartggPageInfo;
  activeSetId?: string;
  search: string;
  searchLoading: boolean;
  searchProgress?: { loaded: number; total: number };
  searchCatalogCount?: number;
  searchCatalogIsCurrent: boolean;
  selectedEvent: boolean;
  draftDirty: boolean;
  modalOpen: boolean;
  loading: boolean;
  loadingMore: boolean;
  gameProfileAvailable: boolean;
  onSearchFocus(): void;
  onSearchChange(search: string): void;
  onCancelSearch(): void;
  onOpenSet(set: SetSummary): void;
  onLoadMore(): void;
};

const statusColors = {
  stream: 'green',
  completed: 'blue',
  pending: 'gray'
} as const;

type SetResultRowProps = {
  set: SetSummary;
  assignment?: StartggStreamAssignment;
  activeSetId?: string;
  disabled: boolean;
  onOpenSet(set: SetSummary): void;
};

const SetResultRow = memo(function SetResultRow({
  set,
  assignment,
  activeSetId,
  disabled,
  onOpenSet
}: SetResultRowProps) {
  const { t } = useTranslation(['operator', 'common']);
  const status = setStatusTone(set, activeSetId);
  const hasDecisiveResult = set.state === '3'
    && set.entrantOneScore !== undefined
    && set.entrantTwoScore !== undefined
    && set.entrantOneScore !== set.entrantTwoScore;
  const playerOneWon = hasDecisiveResult && set.entrantOneScore! > set.entrantTwoScore!;

  return (
    <UnstyledButton
      data-testid={`set-${set.id}`}
      className="set-row"
      disabled={disabled}
      onClick={() => onOpenSet(set)}
    >
      <div className="set-row-topline">
        <span className="set-row-context">
          {[setPhaseContext(set), set.round ?? `Set ${set.id}`].filter(Boolean).join(' · ')}
        </span>
        <div className="set-row-flag-stack">
          <div className="set-row-flags set-row-assignment-flags">
            {assignment && <Badge size="sm" variant="light">{t('operator:selector.streamAssignment', { name: assignment.streamName })}</Badge>}
            {set.station && <Badge size="sm" variant="outline">{set.station}</Badge>}
          </div>
          <Badge className="set-flag-status" color={statusColors[status]} size="sm" variant="light">
            {set.id === activeSetId
              ? t('common:status.onStream')
              : set.state === '3'
                ? t('common:status.completed')
                : t('common:status.pending')}
          </Badge>
        </div>
      </div>
      <div className="set-row-matchup">
        <span className="set-row-player set-row-player-one">
          {hasDecisiveResult && (
            <span className={`set-row-outcome ${playerOneWon ? 'is-winner' : 'is-loser'}`} title={playerOneWon ? t('operator:selector.winner') : t('operator:selector.loser')} aria-label={playerOneWon ? t('operator:selector.winner') : t('operator:selector.loser')}>
              {playerOneWon ? 'W' : 'L'}
            </span>
          )}
          <span className="set-row-player-name">{set.entrantOne?.name ?? t('operator:selector.tbd')}</span>
        </span>
        <span className="set-row-versus">{t('common:match.versus')}</span>
        <span className="set-row-player set-row-player-two">
          <span className="set-row-player-name">{set.entrantTwo?.name ?? t('operator:selector.tbd')}</span>
          {hasDecisiveResult && (
            <span className={`set-row-outcome ${playerOneWon ? 'is-loser' : 'is-winner'}`} title={playerOneWon ? t('operator:selector.loser') : t('operator:selector.winner')} aria-label={playerOneWon ? t('operator:selector.loser') : t('operator:selector.winner')}>
              {playerOneWon ? 'L' : 'W'}
            </span>
          )}
        </span>
      </div>
      {set.state === '3' && set.entrantOneScore !== undefined && set.entrantTwoScore !== undefined && (
        <span className="set-row-final-score">
          {t('common:match.finalScore', { one: set.entrantOneScore, two: set.entrantTwoScore })}
        </span>
      )}
    </UnstyledButton>
  );
}, (previous, next) => (
  previous.set === next.set
  && previous.assignment === next.assignment
  && previous.activeSetId === next.activeSetId
  && previous.disabled === next.disabled
));

function SetSelectorPanelComponent({
  sets,
  visibleSets,
  assignments,
  scope,
  scopeLabel,
  pageInfo,
  activeSetId,
  search,
  searchLoading,
  searchProgress,
  searchCatalogCount,
  searchCatalogIsCurrent,
  selectedEvent,
  draftDirty,
  modalOpen,
  loading,
  loadingMore,
  gameProfileAvailable,
  onSearchFocus,
  onSearchChange,
  onCancelSearch,
  onOpenSet,
  onLoadMore
}: SetSelectorPanelProps) {
  const { t } = useTranslation(['operator', 'common']);
  const resultsRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const assignmentBySetId = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.setId, assignment])),
    [assignments]
  );
  const hasMore = !search.trim() && Boolean(pageInfo && pageInfo.page < pageInfo.totalPages);

  useEffect(() => {
    const root = resultsRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadMore();
      },
      { root, rootMargin: '160px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, pageInfo?.page]);

  return (
    <Paper className="panel set-list" p="md" radius="lg" withBorder>
      <Group justify="space-between" align="flex-start">
        <Box>
          <Text component="h2" fw={800} size="lg">{t('operator:selector.title')}</Text>
          {scope && (
            <Text c="dimmed" size="sm">
              {t('operator:selector.view', { scope: scopeLabel })}
              {pageInfo ? ` · ${t('operator:selector.total', { count: pageInfo.total })}` : ''}
              {/*` · ${t('operator:selector.bracketOrder')}`*/}
            </Text>
          )}
        </Box>
        {loading && <Loader size="sm" aria-label={t('common:status.loading')} />}
      </Group>

      {draftDirty && <Text c="dimmed" size="sm">{t('operator:selector.dirtyWarning')}</Text>}

      {selectedEvent && (
        <Stack gap={6}>
          <TextInput
            data-testid="set-search"
            type="search"
            label={t('operator:selector.search')}
            value={search}
            placeholder={t('operator:selector.searchPlaceholder')}
            onFocus={onSearchFocus}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            description={searchLoading && searchProgress
              ? t('operator:selector.searchProgress', searchProgress)
              : searchCatalogIsCurrent
                ? t('operator:selector.searchAll', { count: searchCatalogCount ?? 0 })
                : pageInfo && pageInfo.totalPages > 1
                  ? t('operator:selector.focusSearch')
                  : t('operator:selector.searchView')}
          />
          {searchLoading && searchProgress && (
            <Group gap="sm" wrap="nowrap">
              <Progress
                value={searchProgress.total ? (searchProgress.loaded / searchProgress.total) * 100 : 0}
                animated
                aria-label={t('operator:selector.loadingAll')}
                style={{ flex: 1 }}
              />
              <Button size="compact-xs" variant="subtle" onClick={onCancelSearch}>
                {t('common:actions.cancel')}
              </Button>
            </Group>
          )}
        </Stack>
      )}

      <Stack
        ref={resultsRef}
        className={`set-results-scroll${modalOpen ? ' is-modal-open' : ''}`}
        data-testid="set-results-scroll"
        role="region"
        aria-label={t('operator:selector.regionAria')}
        tabIndex={0}
        gap="xs"
      >
        {sets.length === 0 ? (
          <Text c="dimmed">{loading ? t('operator:selector.loadingSets') : t('operator:selector.none')}</Text>
        ) : visibleSets.length === 0 ? (
          <Text c="dimmed">
            {searchLoading
              ? t('operator:selector.scanningFor', { query: search.trim() })
              : t('operator:selector.noMatch', { query: search.trim() })}
          </Text>
        ) : visibleSets.map((set) => (
          <SetResultRow
            key={set.id}
            set={set}
            assignment={assignmentBySetId.get(set.id)}
            activeSetId={activeSetId}
            disabled={loading || draftDirty || !gameProfileAvailable}
            onOpenSet={onOpenSet}
          />
        ))}
        {!search.trim() && (
          <Center ref={loadMoreRef} className="set-load-more-sentinel" aria-live="polite">
            {loadingMore
              ? <Loader size="sm" aria-label={t('operator:selector.loadingMore')} />
              : hasMore
                ? <Text c="dimmed" size="xs">{t('operator:selector.scrollMore')}</Text>
                : sets.length > 0 && <Text c="dimmed" size="xs">{t('operator:selector.allLoaded')}</Text>}
          </Center>
        )}
      </Stack>
    </Paper>
  );
}

export const SetSelectorPanel = memo(SetSelectorPanelComponent);
