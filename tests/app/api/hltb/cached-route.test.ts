import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SteamGame } from '@/types/game'

const {
  authMock,
  fetchByIdMock,
  fetchSteamImportMock,
  getLibraryRawMock,
  getOwnedGamesMock,
  loadUserLibraryMock,
  resolveCachedHltbForLibraryMock,
  searchByNameMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  fetchByIdMock: vi.fn(),
  fetchSteamImportMock: vi.fn(),
  getLibraryRawMock: vi.fn(),
  getOwnedGamesMock: vi.fn(),
  loadUserLibraryMock: vi.fn(),
  resolveCachedHltbForLibraryMock: vi.fn(),
  searchByNameMock: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('@/lib/cache/kv', () => ({ getLibraryRaw: getLibraryRawMock }))
vi.mock('@/lib/hltb/cached', () => ({ resolveCachedHltbForLibrary: resolveCachedHltbForLibraryMock }))
vi.mock('@/lib/library/server', () => ({ loadUserLibrary: loadUserLibraryMock }))
vi.mock('@/lib/steam/client', () => ({ getOwnedGames: getOwnedGamesMock }))
vi.mock('@/lib/hltb/client', () => ({
  fetchById: fetchByIdMock,
  fetchSteamImport: fetchSteamImportMock,
  searchByName: searchByNameMock,
}))

beforeEach(() => {
  authMock.mockReset()
  fetchByIdMock.mockReset()
  fetchSteamImportMock.mockReset()
  getLibraryRawMock.mockReset()
  getOwnedGamesMock.mockReset()
  loadUserLibraryMock.mockReset()
  resolveCachedHltbForLibraryMock.mockReset()
  searchByNameMock.mockReset()
})

import { GET } from '@/app/api/hltb/cached/route'

const games: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 60, headerImageUrl: 'portal.jpg' },
]

describe('GET /api/hltb/cached', () => {
  it('reads cached library from KV and resolves cached HLTB data', async () => {
    const hltb = {
      entries: { 1: null },
      cachedAt: { 1: null },
      meta: {},
      sync: {
        needed: false,
        reason: 'none',
        missingAppids: [],
        staleAppids: [],
        cachedCount: 1,
        totalCount: 1,
      },
    }
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    getLibraryRawMock.mockResolvedValueOnce({ value: games, cachedAt: 'cached' })
    resolveCachedHltbForLibraryMock.mockResolvedValueOnce(hltb)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(hltb)
    expect(getLibraryRawMock).toHaveBeenCalledWith('steam-1')
    expect(resolveCachedHltbForLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', games })
    expect(loadUserLibraryMock).not.toHaveBeenCalled()
    expect(getOwnedGamesMock).not.toHaveBeenCalled()
    expect(fetchSteamImportMock).not.toHaveBeenCalled()
    expect(fetchByIdMock).not.toHaveBeenCalled()
    expect(searchByNameMock).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(getLibraryRawMock).not.toHaveBeenCalled()
  })

  it('returns library-cache-missing metadata when cached library is absent', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    getLibraryRawMock.mockResolvedValueOnce(null)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      entries: {},
      cachedAt: {},
      meta: {},
      sync: {
        needed: true,
        reason: 'library-cache-missing',
        missingAppids: [],
        staleAppids: [],
        cachedCount: 0,
        totalCount: 0,
      },
    })
    expect(resolveCachedHltbForLibraryMock).not.toHaveBeenCalled()
  })
})
