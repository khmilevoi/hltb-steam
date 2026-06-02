import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KvError, SteamUnavailableError } from '@/lib/errors'
import type { SteamGame } from '@/types/game'

const { getLibraryMock, getLibraryRawMock, getOwnedGamesMock, setLibraryMock, warnMock } = vi.hoisted(() => ({
  getLibraryMock: vi.fn(),
  getLibraryRawMock: vi.fn(),
  getOwnedGamesMock: vi.fn(),
  setLibraryMock: vi.fn(),
  warnMock: vi.fn(),
}))

vi.mock('@/lib/cache/kv', () => ({
  getLibrary: getLibraryMock,
  getLibraryRaw: getLibraryRawMock,
  setLibrary: setLibraryMock,
}))

vi.mock('@/lib/steam/client', () => ({
  getOwnedGames: getOwnedGamesMock,
}))

beforeEach(() => {
  getLibraryMock.mockReset()
  getLibraryRawMock.mockReset()
  getOwnedGamesMock.mockReset()
  setLibraryMock.mockReset()
  warnMock.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(warnMock)
})

import { loadUserLibrary } from '@/lib/library/server'

const games: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 60, headerImageUrl: 'portal.jpg' },
]

describe('loadUserLibrary', () => {
  it('returns cached library when force is false', async () => {
    getLibraryMock.mockResolvedValueOnce({
      value: games,
      cachedAt: '2026-05-24T00:00:00.000Z',
    })

    const result = await loadUserLibrary({ steamId: 'steam-1', force: false })

    expect(result).toEqual({
      games,
      cachedAt: '2026-05-24T00:00:00.000Z',
    })
    expect(getOwnedGamesMock).not.toHaveBeenCalled()
  })

  it('fetches Steam and writes cache on cache miss', async () => {
    getLibraryMock.mockResolvedValueOnce(null)
    getLibraryRawMock.mockResolvedValueOnce(null)
    getOwnedGamesMock.mockResolvedValueOnce(games)
    setLibraryMock.mockResolvedValueOnce(undefined)

    const result = await loadUserLibrary({ steamId: 'steam-1', force: false })

    expect(result).toEqual({ games, cachedAt: null })
    expect(getOwnedGamesMock).toHaveBeenCalledWith('steam-1')
    expect(setLibraryMock).toHaveBeenCalledWith('steam-1', games)
  })

  it('returns stale cached library before fetching Steam when fresh cache expired', async () => {
    getLibraryMock.mockResolvedValueOnce(null)
    getLibraryRawMock.mockResolvedValueOnce({
      value: games,
      cachedAt: '2026-05-24T00:00:00.000Z',
    })

    const result = await loadUserLibrary({ steamId: 'steam-1', force: false })

    expect(result).toEqual({
      games,
      cachedAt: '2026-05-24T00:00:00.000Z',
    })
    expect(getOwnedGamesMock).not.toHaveBeenCalled()
  })

  it('bypasses cache read when force is true', async () => {
    getOwnedGamesMock.mockResolvedValueOnce(games)
    setLibraryMock.mockResolvedValueOnce(undefined)

    const result = await loadUserLibrary({ steamId: 'steam-1', force: true })

    expect(result).toEqual({ games, cachedAt: null })
    expect(getLibraryMock).not.toHaveBeenCalled()
    expect(getLibraryRawMock).not.toHaveBeenCalled()
  })

  it('returns Steam errors as values', async () => {
    getLibraryMock.mockResolvedValueOnce(null)
    getLibraryRawMock.mockResolvedValueOnce(null)
    const error = new SteamUnavailableError({ reason: 'down' })
    getOwnedGamesMock.mockResolvedValueOnce(error)

    const result = await loadUserLibrary({ steamId: 'steam-1', force: false })

    expect(result).toBe(error)
    expect(setLibraryMock).not.toHaveBeenCalled()
  })

  it('logs and continues on KV read/write errors', async () => {
    getLibraryMock.mockResolvedValueOnce(new KvError({ op: 'get', key: 'library:steam-1' }))
    getLibraryRawMock.mockResolvedValueOnce(null)
    getOwnedGamesMock.mockResolvedValueOnce(games)
    setLibraryMock.mockResolvedValueOnce(new KvError({ op: 'set', key: 'library:steam-1' }))

    const result = await loadUserLibrary({ steamId: 'steam-1', force: false })

    expect(result).toEqual({ games, cachedAt: null })
    expect(warnMock).toHaveBeenCalledTimes(2)
  })
})
