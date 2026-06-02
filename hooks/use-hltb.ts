'use client'

import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchHltb, fetchHltbGame, putHltbOverrideName } from '@/lib/client-fetch'
import { noSyncNeeded } from '@/lib/hltb/sync-meta'
import type { HltbResponse, HltbSingleResponse } from '@/types/game'

export const HLTB_QUERY_KEY = ['hltb'] as const

export function useHltb({ enabled }: { enabled: boolean }) {
  return useQuery({
    enabled,
    queryKey: HLTB_QUERY_KEY,
    queryFn: () => fetchHltb({ force: false }),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function mergeSingleHltbResult(
  old: HltbResponse | undefined,
  appid: number,
  single: HltbSingleResponse,
): HltbResponse {
  return {
    entries: { ...(old?.entries ?? {}), [appid]: single.entry },
    cachedAt: { ...(old?.cachedAt ?? {}), [appid]: single.cachedAt },
    meta: { ...(old?.meta ?? {}), [appid]: single.meta },
    sync: old?.sync ?? noSyncNeeded(1),
  }
}

export async function refreshHltb(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: HLTB_QUERY_KEY,
    queryFn: () => fetchHltb({ force: true }),
    staleTime: 0,
  })
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
  const previousData = queryClient.getQueryData<HltbResponse>(HLTB_QUERY_KEY)
  queryClient.setQueryData(HLTB_QUERY_KEY, (old: HltbResponse | undefined) => {
    if (!old?.meta[appid]) return old
    return {
      ...old,
      meta: { ...old.meta, [appid]: { ...old.meta[appid], overrideName: searchName } },
    }
  })
  try {
    await putHltbOverrideName({ appid, searchName })
    const single = await fetchHltbGame({ appid })
    queryClient.setQueryData(HLTB_QUERY_KEY, (old: HltbResponse | undefined) =>
      mergeSingleHltbResult(old, appid, single),
    )
  } catch (error) {
    queryClient.setQueryData(HLTB_QUERY_KEY, previousData)
    throw error
  }
}
