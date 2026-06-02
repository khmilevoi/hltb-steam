import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HltbRateLimitError } from '@/lib/errors'
import type { HltbEntry, SteamGame } from '@/types/game'

const {
  fetchByIdMock,
  fetchSteamImportMock,
  getHltbEntryByIdMock,
  getHltbFallbackResultMock,
  getHltbLibrarySnapshotMock,
  getHltbMappingMock,
  getHltbOverrideNameMock,
  searchByNameMock,
  setHltbEntryByIdMock,
  setHltbFallbackResultMock,
  setHltbLibrarySnapshotMock,
  setHltbMappingMock,
  warnMock,
} = vi.hoisted(() => ({
  fetchByIdMock: vi.fn(),
  fetchSteamImportMock: vi.fn(),
  getHltbEntryByIdMock: vi.fn(),
  getHltbFallbackResultMock: vi.fn(),
  getHltbLibrarySnapshotMock: vi.fn(),
  getHltbMappingMock: vi.fn(),
  getHltbOverrideNameMock: vi.fn(),
  searchByNameMock: vi.fn(),
  setHltbEntryByIdMock: vi.fn(),
  setHltbFallbackResultMock: vi.fn(),
  setHltbLibrarySnapshotMock: vi.fn(),
  setHltbMappingMock: vi.fn(),
  warnMock: vi.fn(),
}))

vi.mock('@/lib/cache/kv', () => ({
  HLTB_SNAPSHOT_TTL_MS: 12 * 60 * 60 * 1000,
  getHltbEntryById: getHltbEntryByIdMock,
  getHltbFallbackResult: getHltbFallbackResultMock,
  getHltbLibrarySnapshot: getHltbLibrarySnapshotMock,
  getHltbMapping: getHltbMappingMock,
  getHltbOverrideName: getHltbOverrideNameMock,
  isExpired: (cachedAt: string, ttlMs: number) =>
    Date.now() - new Date(cachedAt).getTime() >= ttlMs,
  setHltbEntryById: setHltbEntryByIdMock,
  setHltbFallbackResult: setHltbFallbackResultMock,
  setHltbLibrarySnapshot: setHltbLibrarySnapshotMock,
  setHltbMapping: setHltbMappingMock,
}))

vi.mock('@/lib/hltb/client', () => ({
  fetchById: fetchByIdMock,
  fetchSteamImport: fetchSteamImportMock,
  searchByName: searchByNameMock,
}))

beforeEach(() => {
  vi.useRealTimers()
  fetchByIdMock.mockReset()
  fetchSteamImportMock.mockReset()
  getHltbEntryByIdMock.mockReset()
  getHltbFallbackResultMock.mockReset()
  getHltbLibrarySnapshotMock.mockReset()
  getHltbMappingMock.mockReset()
  getHltbOverrideNameMock.mockReset()
  searchByNameMock.mockReset()
  setHltbEntryByIdMock.mockReset()
  setHltbFallbackResultMock.mockReset()
  setHltbLibrarySnapshotMock.mockReset()
  setHltbMappingMock.mockReset()
  warnMock.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(warnMock)

  getHltbMappingMock.mockResolvedValue(null)
  getHltbLibrarySnapshotMock.mockResolvedValue({
    value: { appids: [1, 2], refreshedAt: new Date().toISOString() },
    cachedAt: new Date().toISOString(),
  })
  getHltbEntryByIdMock.mockResolvedValue(null)
  getHltbFallbackResultMock.mockResolvedValue(null)
  getHltbOverrideNameMock.mockResolvedValue(null)
  searchByNameMock.mockResolvedValue(null)
  setHltbEntryByIdMock.mockResolvedValue(undefined)
  setHltbFallbackResultMock.mockResolvedValue(undefined)
  setHltbLibrarySnapshotMock.mockResolvedValue(undefined)
  setHltbMappingMock.mockResolvedValue(undefined)
})

import { resolveHltbForGame, resolveHltbForLibrary } from '@/lib/hltb/resolve'

const games: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 60, headerImageUrl: 'portal.jpg' },
  { appid: 2, name: 'Hades', playtimeMinutes: 120, headerImageUrl: 'hades.jpg' },
]

const portalEntry: HltbEntry = {
  mainHours: 3,
  mainExtraHours: 5,
  completionistHours: 8,
  hltbId: 7230,
  matchedName: 'Portal',
}

describe('resolveHltbForLibrary', () => {
  it('skips Steam import when all appids already have mappings', async () => {
    getHltbMappingMock
      .mockResolvedValueOnce({
        value: {
          steamAppId: 1,
          hltbId: 7230,
          hltbName: 'Portal',
          discoveredFromSteamId: 'steam-1',
          discoveredAt: 'now',
        },
        cachedAt: 'now',
      })
      .mockResolvedValueOnce({
        value: {
          steamAppId: 2,
          hltbId: 111,
          hltbName: 'Hades',
          discoveredFromSteamId: 'steam-1',
          discoveredAt: 'now',
        },
        cachedAt: 'now',
      })
    fetchByIdMock.mockResolvedValue(portalEntry)

    await resolveHltbForLibrary({ steamId: 'steam-1', games, force: false })

    expect(fetchSteamImportMock).not.toHaveBeenCalled()
  })

  it('imports Steam mappings when snapshot is missing, writes mappings, then rechecks', async () => {
    getHltbLibrarySnapshotMock.mockResolvedValueOnce(null)
    fetchSteamImportMock.mockResolvedValueOnce([
      { steamAppId: 1, hltbId: 7230, hltbName: 'Portal' },
    ])
    getHltbMappingMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        value: {
          steamAppId: 1,
          hltbId: 7230,
          hltbName: 'Portal',
          discoveredFromSteamId: 'steam-1',
          discoveredAt: 'now',
        },
        cachedAt: 'now',
      })
    fetchByIdMock.mockResolvedValue(portalEntry)

    const result = await resolveHltbForLibrary({ steamId: 'steam-1', games: [games[0]], force: false })

    expect(fetchSteamImportMock).toHaveBeenCalledWith('steam-1')
    expect(setHltbMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ steamAppId: 1, hltbId: 7230, hltbName: 'Portal' }),
    )
    expect(setHltbLibrarySnapshotMock).toHaveBeenCalledWith('steam-1', [1])
    expect(result.meta[1]).toEqual({ source: 'steam-import', steamName: 'Portal', overrideName: null })
  })

  it('uses override name before Steam name when no mapping exists', async () => {
    getHltbOverrideNameMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Portal 2007', updatedAt: new Date().toISOString() },
      cachedAt: new Date().toISOString(),
    })
    searchByNameMock.mockResolvedValueOnce(portalEntry)

    const result = await resolveHltbForGame({ steamId: 'steam-1', game: games[0], force: false })

    expect(searchByNameMock).toHaveBeenCalledWith('Portal 2007')
    expect(result).toEqual({
      entry: portalEntry,
      cachedAt: null,
      meta: { source: 'override-name', steamName: 'Portal', overrideName: 'Portal 2007' },
    })
  })

  it('force bypasses entry cache reads but still writes cache', async () => {
    getHltbMappingMock.mockResolvedValueOnce({
      value: {
        steamAppId: 1,
        hltbId: 7230,
        hltbName: 'Portal',
        discoveredFromSteamId: 'steam-1',
        discoveredAt: 'now',
      },
      cachedAt: 'now',
    })
    fetchByIdMock.mockResolvedValueOnce(portalEntry)

    await resolveHltbForGame({ steamId: 'steam-1', game: games[0], force: true })

    expect(getHltbEntryByIdMock).not.toHaveBeenCalled()
    expect(setHltbEntryByIdMock).toHaveBeenCalledWith(7230, portalEntry)
  })

  it('fallback branch always calls searchByName under force=false', async () => {
    getHltbMappingMock.mockResolvedValueOnce(null)
    searchByNameMock.mockResolvedValueOnce(portalEntry)

    const result = await resolveHltbForGame({ steamId: 'steam-1', game: games[0], force: false })

    expect(searchByNameMock).toHaveBeenCalledWith('Portal')
    expect(result.entry).toEqual(portalEntry)
    expect(result.meta).toEqual({ source: 'steam-name', steamName: 'Portal', overrideName: null })
  })

  it('global mapping ignores dormant override and treats detail errors as misses', async () => {
    getHltbMappingMock.mockResolvedValueOnce({
      value: {
        steamAppId: 1,
        hltbId: 7230,
        hltbName: 'Portal',
        discoveredFromSteamId: 'steam-1',
        discoveredAt: 'now',
      },
      cachedAt: 'now',
    })
    getHltbOverrideNameMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Wrong', updatedAt: 'now' },
      cachedAt: 'now',
    })
    fetchByIdMock.mockResolvedValueOnce(new HltbRateLimitError({ retryAfterMs: 10_000 }))

    const result = await resolveHltbForGame({ steamId: 'steam-1', game: games[0], force: false })

    expect(getHltbOverrideNameMock).not.toHaveBeenCalled()
    expect(result.entry).toBeNull()
    expect(result.meta).toEqual({ source: 'steam-import', steamName: 'Portal', overrideName: null })
    expect(warnMock).toHaveBeenCalled()
  })

  it('returns source none when fallback search misses', async () => {
    searchByNameMock.mockResolvedValueOnce(null)

    const result = await resolveHltbForGame({ steamId: 'steam-1', game: games[0], force: false })

    expect(setHltbFallbackResultMock).toHaveBeenCalledWith('steam-1', {
      appid: 1,
      searchName: 'Portal',
      entry: null,
      source: 'none',
    })
    expect(result).toEqual({
      entry: null,
      cachedAt: null,
      meta: { source: 'none', steamName: 'Portal', overrideName: null },
    })
  })

  it('uses fresh fallback result without searching by name', async () => {
    getHltbMappingMock.mockResolvedValueOnce(null)
    getHltbOverrideNameMock.mockResolvedValueOnce(null)
    getHltbFallbackResultMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Portal', entry: portalEntry, source: 'steam-name' },
      cachedAt: '2026-06-02T00:00:00.000Z',
    })

    const result = await resolveHltbForGame({ steamId: 'steam-1', game: games[0], force: false })

    expect(searchByNameMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      entry: portalEntry,
      cachedAt: '2026-06-02T00:00:00.000Z',
      meta: { source: 'steam-name', steamName: 'Portal', overrideName: null },
    })
  })

  it('does not use fallback result when force is true', async () => {
    getHltbFallbackResultMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Portal', entry: portalEntry, source: 'steam-name' },
      cachedAt: '2026-06-02T00:00:00.000Z',
    })
    searchByNameMock.mockResolvedValueOnce(portalEntry)

    await resolveHltbForGame({ steamId: 'steam-1', game: games[0], force: true })

    expect(getHltbFallbackResultMock).not.toHaveBeenCalled()
    expect(searchByNameMock).toHaveBeenCalledWith('Portal')
  })

  it('marks full-library sync as needed when a row has transient HLTB failure', async () => {
    searchByNameMock.mockResolvedValueOnce(new HltbRateLimitError({ retryAfterMs: 10_000 }))

    const result = await resolveHltbForLibrary({ steamId: 'steam-1', games: [games[0]], force: false })

    expect(setHltbFallbackResultMock).not.toHaveBeenCalled()
    expect(result.sync).toMatchObject({
      needed: true,
      reason: 'missing-hltb-data',
      missingAppids: [1],
      cachedCount: 0,
      totalCount: 1,
    })
  })
})
