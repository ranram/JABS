import { memo, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { SetResultRow } from './SetResultRow';
import { usePendingWrites } from '../../pendingWrites';
import {
  matchesSetPills,
  streamAssignmentFilterValue,
  streamPlatform,
  visibleStreamAssignment
} from './setPillFilters';

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
  const busyLabel = loading
    ? t('common:status.loading')
    : draftDirty || pendingWrites
      ? t('operator:selector.dirtyWarning')
      : undefined;
  const searchInputId = useId();
  const resultsRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [pillFilters, setPillFilters] = useState<string[]>([]);
  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    setPillFilters([]);
  }, [scopeKey]);
  const assignmentBySetId = useMemo(() => {
    const queuedBySetId = new Map(assignments.map((assignment) => [assignment.setId, assignment]));
    const bySetId = new Map<string, StartggStreamAssignment>();
    for (const set of visibleSets) {
      const assignment = visibleStreamAssignment(set, queuedBySetId.get(set.id));
      if (assignment) bySetId.set(set.id, assignment);
    }
    return bySetId;
  }, [assignments, visibleSets]);
  const hasMore = !search.trim() && Boolean(pageInfo && pageInfo.page < pageInfo.totalPages);
  const filteredSets = visibleSets.filter((set) =>
    matchesSetPills(set, pillFilters, assignmentBySetId.get(set.id), activeSetId)
  );
  const streamFilterOptions = [
    ...new Map(
      [...assignmentBySetId.values()].map((assignment) => [streamAssignmentFilterValue(assignment), assignment])
    ).values()
  ]
    .sort((left, right) => left.streamName.localeCompare(right.streamName))
    .map((assignment) => ({
      value: `stream:${streamAssignmentFilterValue(assignment)}`,
      label: t('operator:selector.streamAssignment', {
        platform: t(
          `operator:selector.streamPlatforms.${streamPlatform(assignment.streamSource, assignment.streamName)}`
        ),
        name: assignment.streamName
      })
    }));
  const filterOptions = [
    {
      group: t('operator:selector.statusFilter'),
      items: [
        { value: 'status:pending', label: t('common:status.pending') },
        { value: 'status:completed', label: t('common:status.completed') },
        { value: 'status:stream', label: t('common:status.onStream') }
      ]
    },
    {
      group: t('operator:selector.stationFilter'),
      items: [...new Set(visibleSets.flatMap((set) => (set.station ? [set.station] : [])))]
        .sort()
        .map((station) => ({ value: `station:${station}`, label: station }))
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
      <Group justify="space-between" align="center" gap="xs">
        <Group gap="xs" miw={0}>
          {!inDialog && (
            <Text component="h2" fw={800} size="lg" m={0}>
              {t('operator:selector.title')}
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
                  <Loader size="sm" />
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
        className={`set-results-scroll${modalOpen ? ' is-modal-open' : ''}`}
        data-testid="set-results-scroll"
        role="region"
        aria-label={t('operator:selector.regionAria')}
        tabIndex={0}
        gap="xs"
      >
        {sets.length === 0 ? (
          <Text c="dimmed">{loading ? t('operator:selector.loadingSets') : t('operator:selector.none')}</Text>
        ) : filteredSets.length === 0 ? (
          <Text c="dimmed">
            {pillFilters.length > 0
              ? t('operator:selector.noFilterMatch')
              : searchLoading
                ? t('operator:selector.scanningFor', { query: search.trim() })
                : t('operator:selector.noMatch', { query: search.trim() })}
          </Text>
        ) : (
          filteredSets.map((set) => (
            <SetResultRow
              key={set.id}
              set={set}
              assignment={assignmentBySetId.get(set.id)}
              activeSetId={activeSetId}
              disabled={loading || draftDirty || pendingWrites}
              onOpenSet={onOpenSet}
            />
          ))
        )}
        {!search.trim() && (
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
