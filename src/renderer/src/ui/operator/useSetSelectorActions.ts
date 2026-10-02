import { useCallback, useRef } from 'react';
import type { SetSummary } from '@shared/models';

/** Keeps selector callbacks stable while invoking the latest browser actions. */
export function useSetSelectorActions({
  open,
  completeSearch,
  loadMore,
  search,
  setSearch
}: {
  open(set: SetSummary): void;
  completeSearch(): Promise<unknown>;
  loadMore(): Promise<unknown>;
  search: string;
  setSearch(value: string): void;
}) {
  const actions = useRef({ open, completeSearch, loadMore });
  actions.current = { open, completeSearch, loadMore };
  const openSetFromSelector = useCallback((set: SetSummary) => actions.current.open(set), []);
  const focusSetSearch = useCallback(() => {
    if (search.trim()) void actions.current.completeSearch();
  }, [search]);
  const changeSetSearch = useCallback(
    (value: string) => {
      setSearch(value);
      if (value.trim()) void actions.current.completeSearch();
    },
    [setSearch]
  );
  const loadMoreSetsFromSelector = useCallback(() => {
    void actions.current.loadMore();
  }, []);
  return { openSetFromSelector, focusSetSearch, changeSetSearch, loadMoreSetsFromSelector };
}
