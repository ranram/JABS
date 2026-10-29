import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';
import {
  Box,
  Button,
  Center,
  Chip,
  Group,
  Input,
  Loader,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SetSummary, StartggPageInfo, StartggSetScope, StartggStreamAssignment } from '@shared/models';
import { useQueuedSets } from './matchQueueContext';
import { filterLoadedSets } from '../../setSearch';
import { VirtualSetResults } from './VirtualSetResults';
import { usePendingWrites, useWritesInProgress } from '../../pendingWrites';
import { matchesSetPills, streamAssignmentFilterValue, visibleStreamAssignment } from './setPillFilters';
import { StreamAssignmentLabel } from './StreamAssignmentLabel';
import { IconLabel, InfoIcon, ListChecksIcon } from '../icons';
import '../panelHeader.css';

const emptyFilters: string[] = [];

type SetSelectorPanelProps = {
  sets: SetSummary[];
  visibleSets: SetSummary[];
  catalogSets?: SetSummary[];
  onLoadCatalog?(): void;
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
  headerAction?: ReactNode;
  inDialog?: boolean;
  onSearchFocus(): void;
  onSearchChange(search: string): void;
  onCancelSearch(): void;
  onOpenSet(set: SetSummary): void;
  onLoadMore(): void;
};

function SetSelectorPanelComponent({
  sets,
  visibleSets,
  catalogSets,
  onLoadCatalog,
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
  headerAction,
  inDialog = false,
  onSearchFocus,
  onSearchChange,
  onCancelSearch,
  onOpenSet,
  onLoadMore
}: SetSelectorPanelProps) {
  const { t } = useTranslation(['operator', 'common']);
  const pendingWrites = usePendingWrites();
  const writesInProgress = useWritesInProgress();
  const working = loading || writesInProgress;
  const queue = useQueuedSets();
  const queuePositionBySetId = useMemo(
    () => (queue && queue.eventId === scope?.eventId ? queue.positions : new Map<string, number>()),
    [queue, scope?.eventId]
  );
  const busyLabel = loading
    ? t('common:status.loading')
    : draftDirty || writesInProgress
      ? t('operator:selector.dirtyWarning')
      : pendingWrites
        ? t('operator:selector.pendingOutcome')
        : undefined;
  const searchInputId = useId();
  const resultsRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const scopeKey = JSON.stringify(scope);
  const [filterSelection, setFilterSelection] = useState({ scopeKey, values: emptyFilters });
  const pillFilters = filterSelection.scopeKey === scopeKey ? filterSelection.values : emptyFilters;
  const setPillFilters = useCallback((values: string[]) => setFilterSelection({ scopeKey, values }), [scopeKey]);
  const queuedOnly = pillFilters.includes('queue:queued');
  const catalogRequest = useRef<SetSummary[] | undefined>(undefined);
  useEffect(() => {
    if (!queuedOnly) {
      catalogRequest.current = undefined;
      return;
    }
    if (queuePositionBySetId.size && !searchCatalogIsCurrent && catalogRequest.current !== sets) {
      catalogRequest.current = sets;
      onLoadCatalog?.();
    }
  }, [queuedOnly, queuePositionBySetId, searchCatalogIsCurrent, sets, onLoadCatalog]);
  const candidates = useMemo(
    () => (queuedOnly && catalogSets ? filterLoadedSets(catalogSets, search) : visibleSets),
    [queuedOnly, catalogSets, search, visibleSets]
  );
  useEffect(() => {
    setPillFilters([]);
  }, [setPillFilters]);
  const assignmentBySetId = useMemo(() => {
    const queuedBySetId = new Map(assignments.map((assignment) => [assignment.setId, assignment]));
    const bySetId = new Map<string, StartggStreamAssignment>();
    for (const set of candidates) {
      const assignment = visibleStreamAssignment(set, queuedBySetId.get(set.id));
      if (assignment) bySetId.set(set.id, assignment);
    }
    return bySetId;
  }, [assignments, candidates]);
  const hasMore = !queuedOnly && !search.trim() && Boolean(pageInfo && pageInfo.page < pageInfo.totalPages);
  const filteredSets = useMemo(() => {
    const result = candidates.filter((set) =>
      matchesSetPills(set, pillFilters, assignmentBySetId.get(set.id), activeSetId, queuePositionBySetId.has(set.id))
    );
    if (queuedOnly) result.sort((a, b) => queuePositionBySetId.get(a.id)! - queuePositionBySetId.get(b.id)!);
    return result;
  }, [candidates, pillFilters, assignmentBySetId, activeSetId, queuePositionBySetId, queuedOnly]);
  const streamFilterOptions = useMemo(
    () =>
      [
        ...new Map(
          [...assignmentBySetId.values()].map((assignment) => [streamAssignmentFilterValue(assignment), assignment])
        ).values()
      ]
        .sort((left, right) => left.streamName.localeCompare(right.streamName))
        .map((assignment) => ({
          value: `stream:${streamAssignmentFilterValue(assignment)}`,
          label: <StreamAssignmentLabel assignment={assignment} />
        })),
    [assignmentBySetId]
  );
  const stations = useMemo(
    () => [...new Set(candidates.flatMap((set) => (set.station ? [set.station] : [])))].sort(),
    [candidates]
  );
  const filterOptions: Array<{ group: string; items: Array<{ value: string; label: ReactNode }> }> = [
    {
      group: t('operator:selector.statusFilter'),
      items: [
        { value: 'status:pending', label: t('common:status.pending') },
        { value: 'status:completed', label: t('common:status.completed') },
        { value: 'status:stream', label: t('common:status.onStream') }
      ]
    },
    {
      group: t('operator:queue.title'),
      items: [{ value: 'queue:queued', label: t('operator:selector.queued') }]
    },
    {
      group: t('operator:selector.stationFilter'),
      items: stations.map((station) => ({ value: `station:${station}`, label: station }))
    },
    { group: t('operator:selector.streamFilter'), items: streamFilterOptions }
  ];
  const searchHelp =
    searchLoading && searchProgress
      ? t('operator:selector.searchProgress', searchProgress)
      : searchCatalogIsCurrent
        ? t('operator:selector.searchAll', { count: searchCatalogCount ?? 0 })
        : pageInfo && pageInfo.totalPages > 1
          ? t('operator:selector.focusSearch')
          : t('operator:selector.searchView');

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
    <Paper
      className={inDialog ? 'set-list set-selector-dialog' : 'panel set-list'}
      p={inDialog ? 0 : 'md'}
      radius="lg"
      withBorder={!inDialog}
    >
      <Group
        justify="space-between"
        align="center"
        gap="xs"
        className={!inDialog ? 'operator-section-header' : undefined}
        data-inset={!inDialog || undefined}
        style={!inDialog ? ({ '--section-header-inset': 'var(--mantine-spacing-md)' } as CSSProperties) : undefined}
      >
        <Group gap="xs" miw={0}>
          {!inDialog && (
            <Text component="h2" fw={800} size="lg" m={0}>
              <IconLabel icon={ListChecksIcon} size={18}>
                {t('operator:selector.title')}
              </IconLabel>
            </Text>
          )}
          {scope && (
            <Text c="dimmed" size="xs">
              {t('operator:selector.view', { scope: scopeLabel })}
              {pageInfo ? ` · ${t('operator:selector.total', { count: pageInfo.total })}` : ''}
            </Text>
          )}
        </Group>
        {selectedEvent && (
          <Group
            gap={6}
            wrap="wrap"
            justify="flex-end"
            style={{ flex: '1 1 280px', minWidth: 0, marginLeft: 'auto' }}
            role="group"
            aria-label={t('operator:selector.pillFilters')}
          >
            <Tooltip label={t('operator:selector.pillFiltersHelp')} multiline w={260}>
              <Text size="xs" fw={700}>
                {t('operator:selector.pillFilters')}
              </Text>
            </Tooltip>
            <Chip.Group multiple value={pillFilters} onChange={setPillFilters}>
              {filterOptions
                .flatMap(({ items }) => items)
                .map(({ value, label }) => (
                  <Chip key={value} value={value} size="xs" radius="xl">
                    {label}
                  </Chip>
                ))}
            </Chip.Group>
            {pillFilters.length > 0 && (
              <Button variant="subtle" size="compact-xs" onClick={() => setPillFilters([])}>
                {t('operator:selector.clearFilters')}
              </Button>
            )}
          </Group>
        )}
        {(headerAction || busyLabel) && (
          <Group gap="xs">
            {headerAction}
            {busyLabel && (
              <Tooltip label={busyLabel} events={{ hover: true, focus: true, touch: true }}>
                <Box component="span" tabIndex={0} role="status" aria-label={busyLabel}>
                  {working ? <Loader size="sm" /> : <InfoIcon size={18} aria-hidden="true" />}
                </Box>
              </Tooltip>
            )}
          </Group>
        )}
      </Group>

      {selectedEvent && (
        <Stack gap={6}>
          <Group gap="xs" wrap="nowrap">
            <Input.Label htmlFor={searchInputId} size="xs" mb={0} className="set-search-label-content">
              {t('operator:selector.search')}
              <Tooltip label={searchHelp} multiline w={300} events={{ hover: true, focus: true, touch: true }}>
                <Text component="span" c="dimmed" size="xs" tabIndex={0} role="img" aria-label={searchHelp}>
                  ⓘ
                </Text>
              </Tooltip>
            </Input.Label>
            <TextInput
              id={searchInputId}
              data-testid="set-search"
              type="search"
              aria-label={t('operator:selector.search')}
              size="xs"
              flex={1}
              miw={0}
              value={search}
              placeholder={t('operator:selector.searchPlaceholder')}
              onFocus={onSearchFocus}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
            />
          </Group>
          {searchLoading && searchProgress && (
            <Group gap="sm" wrap="nowrap">
              <Text size="xs" c="dimmed" aria-live="polite">
                {t('operator:selector.searchProgress', searchProgress)}
              </Text>
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
        className={`set-results-scroll${inDialog ? ' match-list-frame' : ''}${modalOpen ? ' is-modal-open' : ''}`}
        data-testid="set-results-scroll"
        role="region"
        aria-label={t('operator:selector.regionAria')}
        tabIndex={0}
        gap="sm"
      >
        {sets.length === 0 ? (
          <Text c="dimmed">{loading ? t('operator:selector.loadingSets') : t('operator:selector.none')}</Text>
        ) : filteredSets.length === 0 ? (
          <Text c="dimmed">
            {queuedOnly && searchLoading
              ? t('operator:selector.loadingAll')
              : pillFilters.length > 0
                ? t('operator:selector.noFilterMatch')
                : searchLoading
                  ? t('operator:selector.scanningFor', { query: search.trim() })
                  : t('operator:selector.noMatch', { query: search.trim() })}
          </Text>
        ) : (
          <VirtualSetResults
            sets={filteredSets}
            scrollRef={resultsRef}
            resetKey={`${scopeKey}:${search}:${pillFilters.join(',')}`}
            assignments={assignmentBySetId}
            queuePositions={queuePositionBySetId}
            activeSetId={activeSetId}
            disabled={loading || draftDirty || pendingWrites}
            onOpenSet={onOpenSet}
          />
        )}
        {!queuedOnly && !search.trim() && (
          <Center ref={loadMoreRef} className="set-load-more-sentinel" aria-live="polite">
            {loadingMore ? (
              <Loader size="sm" aria-label={t('operator:selector.loadingMore')} />
            ) : hasMore ? (
              <Text c="dimmed" size="xs">
                {t('operator:selector.scrollMore')}
              </Text>
            ) : (
              sets.length > 0 && (
                <Text c="dimmed" size="xs">
                  {t('operator:selector.allLoaded')}
                </Text>
              )
            )}
          </Center>
        )}
      </Stack>
    </Paper>
  );
}

export const SetSelectorPanel = memo(SetSelectorPanelComponent);
