'use client'

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  fetchHltb,
  fetchHltbCached,
  fetchHltbGame,
  fetchHltbState,
  putHltbOverrideName,
} from '@/lib/client-fetch'
import { noSyncNeeded } from '@/lib/hltb/sync-meta'
import type { HltbResponse, HltbSingleResponse } from '@/types/game'

export const HLTB_CACHED_QUERY_KEY = ['hltb', 'cached'] as const
export const HLTB_SYNC_QUERY_KEY = ['hltb', 'sync'] as const
export const HLTB_STATE_QUERY_KEY = ['hltb', 'state'] as const
export const HLTB_QUERY_KEY = HLTB_CACHED_QUERY_KEY

export type HltbQueryData = HltbResponse & {
  stateRevision: string
}

export function useHltb({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient()

  const state = useQuery({
    enabled,
    queryKey: HLTB_STATE_QUERY_KEY,
    queryFn: fetchHltbState,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const cachedExisting = queryClient.getQueryData<HltbQueryData>(HLTB_CACHED_QUERY_KEY)
  const shouldFetchCached =
    enabled &&
    state.data !== undefined &&
    cachedExisting?.stateRevision !== state.data.revision

  const cached = useQuery({
    enabled: shouldFetchCached,
    queryKey: HLTB_CACHED_QUERY_KEY,
    queryFn: async () => ({
      ...(await fetchHltbCached()),
      stateRevision: state.data!.revision,
    }),
    staleTime: shouldFetchCached ? 0 : 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const visible = cached.data ?? cachedExisting
  const shouldSync = enabled && visible?.sync.needed === true && state.data !== undefined

  const sync = useQuery({
    enabled: shouldSync,
    queryKey: HLTB_SYNC_QUERY_KEY,
    queryFn: async () => {
      const response = await fetchHltb({ force: false })
      const latestState = await queryClient.fetchQuery({
        queryKey: HLTB_STATE_QUERY_KEY,
        queryFn: fetchHltbState,
        staleTime: 0,
      })
      const data = { ...response, stateRevision: latestState.revision }
      queryClient.setQueryData(HLTB_CACHED_QUERY_KEY, data)
      return data
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  return {
    data: sync.data ?? visible,
    error: state.error ?? cached.error ?? sync.error,
    isError: state.isError || cached.isError || sync.isError,
    isFetching: state.isFetching || cached.isFetching || sync.isFetching,
    isLoading: state.isLoading || (shouldFetchCached && cached.isLoading),
    state,
    cached,
    sync,
  }
}

export function mergeSingleHltbResult(
  old: HltbQueryData | undefined,
  appid: number,
  single: HltbSingleResponse,
  stateRevision = old?.stateRevision ?? '',
): HltbQueryData {
  return {
    entries: { ...(old?.entries ?? {}), [appid]: single.entry },
    cachedAt: { ...(old?.cachedAt ?? {}), [appid]: single.cachedAt },
    meta: { ...(old?.meta ?? {}), [appid]: single.meta },
    sync: old?.sync ?? noSyncNeeded(1),
    stateRevision,
  }
}

export async function refreshHltb(queryClient: QueryClient) {
  const state = await queryClient.fetchQuery({
    queryKey: HLTB_STATE_QUERY_KEY,
    queryFn: fetchHltbState,
    staleTime: 0,
  })

  const current = queryClient.getQueryData<HltbQueryData>(HLTB_CACHED_QUERY_KEY)
  let visible = current

  if (!visible || visible.stateRevision !== state.revision) {
    const cached = await fetchHltbCached()
    visible = { ...cached, stateRevision: state.revision }
    queryClient.setQueryData(HLTB_CACHED_QUERY_KEY, visible)
  }

  if (!visible.sync.needed) return visible

  const synced = await queryClient.fetchQuery({
    queryKey: HLTB_SYNC_QUERY_KEY,
    queryFn: () => fetchHltb({ force: true }),
    staleTime: 0,
  })
  const latestState = await queryClient.fetchQuery({
    queryKey: HLTB_STATE_QUERY_KEY,
    queryFn: fetchHltbState,
    staleTime: 0,
  })
  const data = { ...synced, stateRevision: latestState.revision }
  queryClient.setQueryData(HLTB_CACHED_QUERY_KEY, data)
  return data
}

export async function saveHltbOverrideAndRefresh({
  appid,
  queryClient,
  searchName,
}: {
  appid: number
  queryClient: QueryClient
  searchName: string | null
}) {
  const previousData = queryClient.getQueryData<HltbQueryData>(HLTB_CACHED_QUERY_KEY)
  queryClient.setQueryData(HLTB_CACHED_QUERY_KEY, (old: HltbQueryData | undefined) => {
    if (!old?.meta[appid]) return old
    return {
      ...old,
      meta: { ...old.meta, [appid]: { ...old.meta[appid], overrideName: searchName } },
    }
  })
  try {
    await putHltbOverrideName({ appid, searchName })
    const latestState = await fetchHltbState()
    const single = await fetchHltbGame({ appid })
    queryClient.setQueryData(HLTB_CACHED_QUERY_KEY, (old: HltbQueryData | undefined) =>
      mergeSingleHltbResult(old, appid, single, latestState.revision),
    )
  } catch (error) {
    queryClient.setQueryData(HLTB_CACHED_QUERY_KEY, previousData)
    throw error
  }
}
