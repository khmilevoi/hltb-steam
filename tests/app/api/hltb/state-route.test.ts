import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KvError } from '@/lib/errors'

const {
  authMock,
  ensureHltbUserStateMock,
  fetchByIdMock,
  fetchSteamImportMock,
  getLibraryMock,
  getOwnedGamesMock,
  loadUserLibraryMock,
  resolveCachedHltbForLibraryMock,
  resolveHltbForLibraryMock,
  searchByNameMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureHltbUserStateMock: vi.fn(),
  fetchByIdMock: vi.fn(),
  fetchSteamImportMock: vi.fn(),
  getLibraryMock: vi.fn(),
  getOwnedGamesMock: vi.fn(),
  loadUserLibraryMock: vi.fn(),
  resolveCachedHltbForLibraryMock: vi.fn(),
  resolveHltbForLibraryMock: vi.fn(),
  searchByNameMock: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('@/lib/cache/kv', () => ({
  ensureHltbUserState: ensureHltbUserStateMock,
  getLibrary: getLibraryMock,
}))
vi.mock('@/lib/library/server', () => ({ loadUserLibrary: loadUserLibraryMock }))
vi.mock('@/lib/steam/client', () => ({ getOwnedGames: getOwnedGamesMock }))
vi.mock('@/lib/hltb/client', () => ({
  fetchById: fetchByIdMock,
  fetchSteamImport: fetchSteamImportMock,
  searchByName: searchByNameMock,
}))
vi.mock('@/lib/hltb/cached', () => ({ resolveCachedHltbForLibrary: resolveCachedHltbForLibraryMock }))
vi.mock('@/lib/hltb/resolve', () => ({ resolveHltbForLibrary: resolveHltbForLibraryMock }))

beforeEach(() => {
  authMock.mockReset()
  ensureHltbUserStateMock.mockReset()
  fetchByIdMock.mockReset()
  fetchSteamImportMock.mockReset()
  getLibraryMock.mockReset()
  getOwnedGamesMock.mockReset()
  loadUserLibraryMock.mockReset()
  resolveCachedHltbForLibraryMock.mockReset()
  resolveHltbForLibraryMock.mockReset()
  searchByNameMock.mockReset()
})

import { GET } from '@/app/api/hltb/state/route'

describe('GET /api/hltb/state', () => {
  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(ensureHltbUserStateMock).not.toHaveBeenCalled()
  })

  it('returns ensured user HLTB state for authenticated users', async () => {
    const state = {
      revision: 'revision-1',
      updatedAt: '2026-06-02T10:00:00.000Z',
    }
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    ensureHltbUserStateMock.mockResolvedValueOnce(state)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(state)
    expect(ensureHltbUserStateMock).toHaveBeenCalledWith('steam-1')
    expect(getLibraryMock).not.toHaveBeenCalled()
    expect(loadUserLibraryMock).not.toHaveBeenCalled()
    expect(getOwnedGamesMock).not.toHaveBeenCalled()
    expect(fetchSteamImportMock).not.toHaveBeenCalled()
    expect(fetchByIdMock).not.toHaveBeenCalled()
    expect(searchByNameMock).not.toHaveBeenCalled()
    expect(resolveCachedHltbForLibraryMock).not.toHaveBeenCalled()
    expect(resolveHltbForLibraryMock).not.toHaveBeenCalled()
  })

  it('returns 500 on KV failure', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    ensureHltbUserStateMock.mockResolvedValueOnce(new KvError({ op: 'get', key: 'x' }))

    const response = await GET()

    expect(response.status).toBe(500)
  })
})
