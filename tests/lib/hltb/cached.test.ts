import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KvError } from '@/lib/errors'
import type { HltbEntry, SteamGame } from '@/types/game'

const {
  getHltbEntryByIdRawMock,
  getHltbFallbackResultRawMock,
  getHltbMappingRawMock,
  getHltbOverrideNameMock,
  warnMock,
} = vi.hoisted(() => ({
  getHltbEntryByIdRawMock: vi.fn(),
  getHltbFallbackResultRawMock: vi.fn(),
  getHltbMappingRawMock: vi.fn(),
  getHltbOverrideNameMock: vi.fn(),
  warnMock: vi.fn(),
}))

vi.mock('@/lib/cache/kv', () => ({
  HLTB_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  getHltbEntryByIdRaw: getHltbEntryByIdRawMock,
  getHltbFallbackResultRaw: getHltbFallbackResultRawMock,
  getHltbMappingRaw: getHltbMappingRawMock,
  getHltbOverrideName: getHltbOverrideNameMock,
  isExpired: (cachedAt: string, ttlMs: number) =>
    Date.now() - new Date(cachedAt).getTime() >= ttlMs,
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-02T12:00:00.000Z'))
  getHltbEntryByIdRawMock.mockReset()
  getHltbFallbackResultRawMock.mockReset()
  getHltbMappingRawMock.mockReset()
  getHltbOverrideNameMock.mockReset()
  warnMock.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(warnMock)

  getHltbMappingRawMock.mockResolvedValue(null)
  getHltbEntryByIdRawMock.mockResolvedValue(null)
  getHltbOverrideNameMock.mockResolvedValue(null)
  getHltbFallbackResultRawMock.mockResolvedValue(null)
})

import { resolveCachedHltbForLibrary } from '@/lib/hltb/cached'

const games: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 60, headerImageUrl: 'portal.jpg' },
]

const twoGames: SteamGame[] = [
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

const fresh = '2026-06-02T00:00:00.000Z'
const stale = '2026-05-24T00:00:00.000Z'

describe('resolveCachedHltbForLibrary', () => {
  it('starts cached lookups for multiple games in parallel', async () => {
    let resolveFirstMapping: (value: null) => void = () => {}
    getHltbMappingRawMock.mockImplementation((appid: number) => {
      if (appid === 1) {
        return new Promise<null>((resolve) => {
          resolveFirstMapping = resolve
        })
      }
      return Promise.resolve(null)
    })

    const resultPromise = resolveCachedHltbForLibrary({ steamId: 'steam-1', games: twoGames })
    await Promise.resolve()

    expect(getHltbMappingRawMock).toHaveBeenCalledWith(2)

    resolveFirstMapping(null)
    await resultPromise
  })

  it('returns mapped fresh cached entries without sync', async () => {
    getHltbMappingRawMock.mockResolvedValueOnce({
      value: { steamAppId: 1, hltbId: 7230, hltbName: 'Portal' },
      cachedAt: fresh,
    })
    getHltbEntryByIdRawMock.mockResolvedValueOnce({ value: portalEntry, cachedAt: fresh })

    const result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })

    expect(result.entries[1]).toEqual(portalEntry)
    expect(result.cachedAt[1]).toBe(fresh)
    expect(result.meta[1]).toEqual({ source: 'steam-import', steamName: 'Portal', overrideName: null })
    expect(result.sync).toEqual({
      needed: false,
      reason: 'none',
      missingAppids: [],
      staleAppids: [],
      cachedCount: 1,
      totalCount: 1,
    })
  })

  it('treats mapped fresh cached null entries as final cached state', async () => {
    getHltbMappingRawMock.mockResolvedValueOnce({
      value: { steamAppId: 1, hltbId: 7230, hltbName: 'Portal' },
      cachedAt: fresh,
    })
    getHltbEntryByIdRawMock.mockResolvedValueOnce({ value: null, cachedAt: fresh })

    const result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })

    expect(result.entries[1]).toBeNull()
    expect(result.sync.needed).toBe(false)
    expect(result.sync.cachedCount).toBe(1)
  })

  it('reports mapped rows without cached entry as missing', async () => {
    getHltbMappingRawMock.mockResolvedValueOnce({
      value: { steamAppId: 1, hltbId: 7230, hltbName: 'Portal' },
      cachedAt: fresh,
    })
    getHltbEntryByIdRawMock.mockResolvedValueOnce(null)

    const result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })

    expect(result.sync).toMatchObject({
      needed: true,
      reason: 'missing-hltb-data',
      missingAppids: [1],
      staleAppids: [],
    })
  })

  it('keeps stale mapped entries visible while reporting stale sync', async () => {
    getHltbMappingRawMock.mockResolvedValueOnce({
      value: { steamAppId: 1, hltbId: 7230, hltbName: 'Portal' },
      cachedAt: stale,
    })
    getHltbEntryByIdRawMock.mockResolvedValueOnce({ value: portalEntry, cachedAt: stale })

    let result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })
    expect(result.entries[1]).toEqual(portalEntry)
    expect(result.cachedAt[1]).toBe(stale)
    expect(result.meta[1]).toEqual({ source: 'steam-import', steamName: 'Portal', overrideName: null })
    expect(result.sync).toMatchObject({ needed: true, reason: 'stale-hltb-data', staleAppids: [1] })

    getHltbMappingRawMock.mockResolvedValueOnce({
      value: { steamAppId: 1, hltbId: 7230, hltbName: 'Portal' },
      cachedAt: fresh,
    })
    getHltbEntryByIdRawMock.mockResolvedValueOnce({ value: portalEntry, cachedAt: stale })

    result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })
    expect(result.entries[1]).toEqual(portalEntry)
    expect(result.cachedAt[1]).toBe(stale)
    expect(result.sync).toMatchObject({ needed: true, reason: 'stale-hltb-data', staleAppids: [1] })
  })

  it('keeps stale fallback entries visible while reporting stale sync', async () => {
    getHltbFallbackResultRawMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Portal', entry: portalEntry, source: 'steam-name' },
      cachedAt: stale,
    })

    const result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })

    expect(result.entries[1]).toEqual(portalEntry)
    expect(result.cachedAt[1]).toBe(stale)
    expect(result.meta[1]).toEqual({ source: 'steam-name', steamName: 'Portal', overrideName: null })
    expect(result.sync).toMatchObject({ needed: true, reason: 'stale-hltb-data', staleAppids: [1] })
  })

  it('uses fresh fallback null as final cached state', async () => {
    getHltbMappingRawMock.mockResolvedValueOnce(null)
    getHltbOverrideNameMock.mockResolvedValueOnce(null)
    getHltbFallbackResultRawMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Portal', entry: null, source: 'none' },
      cachedAt: fresh,
    })

    const result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })

    expect(result.entries[1]).toBeNull()
    expect(result.meta[1]).toEqual({ source: 'none', steamName: 'Portal', overrideName: null })
    expect(result.sync).toMatchObject({ needed: false, reason: 'none', cachedCount: 1, totalCount: 1 })
  })

  it('uses fresh fallback entry as final cached state', async () => {
    getHltbFallbackResultRawMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Portal', entry: portalEntry, source: 'steam-name' },
      cachedAt: fresh,
    })

    const result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })

    expect(result.entries[1]).toEqual(portalEntry)
    expect(result.meta[1]).toEqual({ source: 'steam-name', steamName: 'Portal', overrideName: null })
    expect(result.sync.needed).toBe(false)
  })

  it('treats missing fallback or changed effective search name as missing', async () => {
    getHltbFallbackResultRawMock.mockResolvedValueOnce(null)
    let result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })
    expect(result.sync).toMatchObject({ needed: true, missingAppids: [1] })

    getHltbOverrideNameMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Portal 2007', updatedAt: fresh },
      cachedAt: fresh,
    })
    getHltbFallbackResultRawMock.mockResolvedValueOnce({
      value: { appid: 1, searchName: 'Portal', entry: portalEntry, source: 'steam-name' },
      cachedAt: fresh,
    })
    result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })
    expect(result.sync).toMatchObject({ needed: true, missingAppids: [1] })
  })

  it('logs KV read errors and treats the row as missing', async () => {
    getHltbMappingRawMock.mockResolvedValueOnce(new KvError({ op: 'get', key: 'x' }))

    const result = await resolveCachedHltbForLibrary({ steamId: 'steam-1', games })

    expect(result.sync).toMatchObject({ needed: true, reason: 'missing-hltb-data', missingAppids: [1] })
    expect(warnMock).toHaveBeenCalled()
  })
})
