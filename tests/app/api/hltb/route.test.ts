import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SteamGame } from '@/types/game'

const { authMock, loadUserLibraryMock, resolveHltbForLibraryMock, touchHltbUserStateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  loadUserLibraryMock: vi.fn(),
  resolveHltbForLibraryMock: vi.fn(),
  touchHltbUserStateMock: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('@/lib/library/server', () => ({ loadUserLibrary: loadUserLibraryMock }))
vi.mock('@/lib/hltb/resolve', () => ({ resolveHltbForLibrary: resolveHltbForLibraryMock }))
vi.mock('@/lib/cache/kv', () => ({ touchHltbUserState: touchHltbUserStateMock }))

beforeEach(() => {
  authMock.mockReset()
  loadUserLibraryMock.mockReset()
  resolveHltbForLibraryMock.mockReset()
  touchHltbUserStateMock.mockReset()
  touchHltbUserStateMock.mockResolvedValue({
    revision: 'revision-1',
    updatedAt: '2026-06-02T10:00:00.000Z',
  })
})

import { GET } from '@/app/api/hltb/route'

const games: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 60, headerImageUrl: 'portal.jpg' },
]

const completeSync = {
  needed: false,
  reason: 'none',
  missingAppids: [],
  staleAppids: [],
  cachedCount: 1,
  totalCount: 1,
} as const

describe('GET /api/hltb', () => {
  it('loads library server-side and resolves HLTB', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    loadUserLibraryMock.mockResolvedValueOnce({ games, cachedAt: 'cached' })
    resolveHltbForLibraryMock.mockResolvedValueOnce({
      entries: { 1: null },
      cachedAt: { 1: null },
      meta: {},
      sync: completeSync,
    })

    const response = await GET(new Request('http://localhost/api/hltb'))

    expect(response.status).toBe(200)
    expect(loadUserLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', force: false })
    expect(resolveHltbForLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', games, force: false })
    expect(touchHltbUserStateMock).toHaveBeenCalledWith('steam-1')
  })

  it('passes HLTB force without forcing Steam library refresh', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    loadUserLibraryMock.mockResolvedValueOnce({ games, cachedAt: 'cached' })
    resolveHltbForLibraryMock.mockResolvedValueOnce({ entries: {}, cachedAt: {}, meta: {}, sync: completeSync })

    await GET(new Request('http://localhost/api/hltb?force=1'))

    expect(loadUserLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', force: false })
    expect(resolveHltbForLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', games, force: true })
  })

  it('returns 500 when touching user HLTB state fails after sync', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    loadUserLibraryMock.mockResolvedValueOnce({ games, cachedAt: 'cached' })
    resolveHltbForLibraryMock.mockResolvedValueOnce({
      entries: { 1: null },
      cachedAt: { 1: null },
      meta: {},
      sync: completeSync,
    })
    touchHltbUserStateMock.mockResolvedValueOnce(new Error('kv down'))

    const response = await GET(new Request('http://localhost/api/hltb'))

    expect(response.status).toBe(500)
  })

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null)

    const response = await GET(new Request('http://localhost/api/hltb'))

    expect(response.status).toBe(401)
  })
})
