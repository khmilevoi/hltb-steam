import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HltbEntry, HltbResponse, HltbStateResponse, HltbSyncMeta } from '@/types/game'

const { fetchHltbCachedMock, fetchHltbMock, fetchHltbStateMock } = vi.hoisted(() => ({
  fetchHltbCachedMock: vi.fn(),
  fetchHltbMock: vi.fn(),
  fetchHltbStateMock: vi.fn(),
}))

vi.mock('@/lib/client-fetch', () => ({
  fetchHltb: fetchHltbMock,
  fetchHltbCached: fetchHltbCachedMock,
  fetchHltbGame: vi.fn(),
  fetchHltbState: fetchHltbStateMock,
  putHltbOverrideName: vi.fn(),
}))

import {
  HLTB_CACHED_QUERY_KEY,
  HLTB_STATE_QUERY_KEY,
  HLTB_SYNC_QUERY_KEY,
  refreshHltb,
  type HltbQueryData,
  useHltb,
} from '@/hooks/use-hltb'

const portalEntry: HltbEntry = {
  mainHours: 3,
  mainExtraHours: 5,
  completionistHours: 8,
  hltbId: 7230,
  matchedName: 'Portal',
}

function sync(needed: boolean, missingAppids: number[] = []): HltbSyncMeta {
  return {
    needed,
    reason: needed ? 'missing-hltb-data' : 'none',
    missingAppids,
    staleAppids: [] as number[],
    cachedCount: needed ? 0 : 1,
    totalCount: 1,
  }
}

function hltbResponse(entry: HltbEntry | null, needed = false): HltbResponse {
  return {
    entries: { 1: entry },
    cachedAt: { 1: entry ? '2026-06-02T00:00:00.000Z' : null },
    meta: { 1: { source: entry ? 'steam-name' : 'none', steamName: 'Portal', overrideName: null } },
    sync: sync(needed, needed ? [1] : []),
  }
}

function state(revision: string): HltbStateResponse {
  return { revision, updatedAt: '2026-06-02T10:00:00.000Z' }
}

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(() => {
  fetchHltbCachedMock.mockReset()
  fetchHltbMock.mockReset()
  fetchHltbStateMock.mockReset()
})

describe('useHltb cached state flow', () => {
  it('exports separate state, cached, and sync query keys', () => {
    expect(HLTB_STATE_QUERY_KEY).toEqual(['hltb', 'state'])
    expect(HLTB_CACHED_QUERY_KEY).toEqual(['hltb', 'cached'])
    expect(HLTB_SYNC_QUERY_KEY).toEqual(['hltb', 'sync'])
  })

  it('reuses persisted cached data when server revision matches', async () => {
    const queryClient = createClient()
    const persisted: HltbQueryData = { ...hltbResponse(portalEntry), stateRevision: 'rev-1' }
    queryClient.setQueryData(HLTB_CACHED_QUERY_KEY, persisted)
    fetchHltbStateMock.mockResolvedValue(state('rev-1'))

    const { result } = renderHook(() => useHltb({ enabled: true }), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current.data?.stateRevision).toBe('rev-1'))
    expect(result.current.data?.entries[1]).toEqual(portalEntry)
    expect(fetchHltbCachedMock).not.toHaveBeenCalled()
    expect(fetchHltbMock).not.toHaveBeenCalled()
  })

  it('fetches cached data when server revision changed', async () => {
    const queryClient = createClient()
    queryClient.setQueryData<HltbQueryData>(HLTB_CACHED_QUERY_KEY, {
      ...hltbResponse(portalEntry),
      stateRevision: 'old-rev',
    })
    fetchHltbStateMock.mockResolvedValue(state('new-rev'))
    fetchHltbCachedMock.mockResolvedValue(hltbResponse(null))

    const { result } = renderHook(() => useHltb({ enabled: true }), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(fetchHltbCachedMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.data?.stateRevision).toBe('new-rev'))
    expect(result.current.data?.entries[1]).toBeNull()
    expect(fetchHltbMock).not.toHaveBeenCalled()
  })

  it('starts full sync when cached response reports sync needed', async () => {
    const queryClient = createClient()
    fetchHltbStateMock.mockResolvedValue(state('rev-1'))
    fetchHltbCachedMock.mockResolvedValue(hltbResponse(null, true))
    fetchHltbMock.mockResolvedValue(hltbResponse(portalEntry))

    const { result } = renderHook(() => useHltb({ enabled: true }), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(fetchHltbMock).toHaveBeenCalledWith({ force: false }))
    await waitFor(() => expect(result.current.data?.entries[1]).toEqual(portalEntry))
    expect(fetchHltbStateMock).toHaveBeenCalled()
  })

  it('keeps cached values visible while full sync is pending', async () => {
    const queryClient = createClient()
    let resolveSync: (value: HltbResponse) => void = () => {}
    fetchHltbStateMock.mockResolvedValue(state('rev-1'))
    fetchHltbCachedMock.mockResolvedValue(hltbResponse(portalEntry, true))
    fetchHltbMock.mockReturnValue(new Promise<HltbResponse>((resolve) => { resolveSync = resolve }))

    const { result } = renderHook(() => useHltb({ enabled: true }), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(fetchHltbMock).toHaveBeenCalled())
    expect(result.current.data?.entries[1]).toEqual(portalEntry)

    resolveSync(hltbResponse(null))
    await waitFor(() => expect(result.current.data?.entries[1]).toBeNull())
  })

  it('manual refresh checks state first and skips full sync when current complete data matches', async () => {
    const queryClient = createClient()
    queryClient.setQueryData<HltbQueryData>(HLTB_CACHED_QUERY_KEY, {
      ...hltbResponse(portalEntry),
      stateRevision: 'rev-1',
    })
    fetchHltbStateMock.mockResolvedValue(state('rev-1'))

    const result = await refreshHltb(queryClient)

    expect(result.entries[1]).toEqual(portalEntry)
    expect(fetchHltbStateMock).toHaveBeenCalledTimes(1)
    expect(fetchHltbCachedMock).not.toHaveBeenCalled()
    expect(fetchHltbMock).not.toHaveBeenCalled()
  })
})
