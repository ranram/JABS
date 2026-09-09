import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Center, Chip, Group, Loader, Paper, Progress, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type {
  SetSummary,
  StartggPageInfo,
  StartggSetScope,
  StartggStreamAssignment
} from '@shared/models';
import { SetResultRow } from './SetResultRow';
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
  gameProfileAvailable: boolean;
  headerAction?: ReactNode;
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
  gameProfileAvailable,
  headerAction,
  onSearchFocus,
  onSearchChange,
  onCancelSearch,
  onOpenSet,
  onLoadMore
}: SetSelectorPanelProps) {
  const { t } = useTranslation(['operator', 'common']);
  const resultsRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [pillFilters, setPillFilters] = useState<string[]>([]);
  const scopeKey = JSON.stringify(scope);
  useEffect(() => { setPillFilters([]); }, [scopeKey]);
  const assignmentBySetId = useMemo(
    () => {
      const queuedBySetId = new Map(assignments.map((assignment) => [assignment.setId, assignment]));
      const bySetId = new Map<string, StartggStreamAssignment>();
      for (const set of visibleSets) {
        const assignment = visibleStreamAssignment(set, queuedBySetId.get(set.id));
        if (assignment) bySetId.set(set.id, assignment);
      }
      return bySetId;
    },
    [assignments, visibleSets]
  );
  const hasMore = !search.trim() && Boolean(pageInfo && pageInfo.page < pageInfo.totalPages);
  const filteredSets = visibleSets.filter((set) => matchesSetPills(set, pillFilters, assignmentBySetId.get(set.id), activeSetId));
  const streamFilterOptions = [...new Map([...assignmentBySetId.values()].map((assignment) => [
    streamAssignmentFilterValue(assignment), assignment
  ])).values()]
    .sort((left, right) => left.streamName.localeCompare(right.streamName))
    .map((assignment) => ({
      value: `stream:${streamAssignmentFilterValue(assignment)}`,
      label: t('operator:selector.streamAssignment', {
        platform: t(`operator:selector.streamPlatforms.${streamPlatform(assignment.streamSource, assignment.streamName)}`),
        name: assignment.streamName
      })
    }));
  const filterOptions = [
    { group: t('operator:selector.statusFilter'), items: [
      { value: 'status:pending', label: t('common:status.pending') },
      { value: 'status:completed', label: t('common:status.completed') },
      { value: 'status:stream', label: t('common:status.onStream') }
    ] },
    { group: t('operator:selector.stationFilter'), items: [...new Set(visibleSets.flatMap((set) => set.station ? [set.station] : []))].sort().map((station) => ({ value: `station:${station}`, label: station })) },
    { group: t('operator:selector.streamFilter'), items: streamFilterOptions }
  ];

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
        <Box style={{ flexShrink: 0 }}>
          <Text component="h2" fw={800} size="lg">{t('operator:selector.title')}</Text>
          {scope && (
            <Text c="dimmed" size="sm">
              {t('operator:selector.view', { scope: scopeLabel })}
              {pageInfo ? ` · ${t('operator:selector.total', { count: pageInfo.total })}` : ''}
            </Text>
          )}
        </Box>
      {selectedEvent && <Group gap={6} wrap="wrap" justify="flex-end" style={{ flex: '1 1 280px', minWidth: 0, marginLeft: 'auto', paddingTop: 3 }} role="group" aria-label={t('operator:selector.pillFilters')}>
        <Tooltip label={t('operator:selector.pillFiltersHelp')} multiline w={260}>
          <Text size="xs" fw={700}>{t('operator:selector.pillFilters')}</Text>
        </Tooltip>
        <Chip.Group multiple value={pillFilters} onChange={setPillFilters}>
          {filterOptions.flatMap(({ items }) => items).map(({ value, label }) => (
            <Chip key={value} value={value} size="xs" radius="xl">{label}</Chip>
          ))}
        </Chip.Group>
        {pillFilters.length > 0 && <Button variant="subtle" size="compact-xs" onClick={() => setPillFilters([])}>{t('operator:selector.clearFilters')}</Button>}
      </Group>}
        <Group gap="xs">
          {headerAction}
          {loading && <Loader size="sm" aria-label={t('common:status.loading')} />}
        </Group>
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
            inputWrapperOrder={['label', 'input', 'description', 'error']}
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
        ) : filteredSets.length === 0 ? (
          <Text c="dimmed">
            {pillFilters.length > 0 ? t('operator:selector.noFilterMatch') : searchLoading
              ? t('operator:selector.scanningFor', { query: search.trim() })
              : t('operator:selector.noMatch', { query: search.trim() })}
          </Text>
        ) : filteredSets.map((set) => (
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
