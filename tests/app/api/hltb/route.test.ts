import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SteamGame } from '@/types/game'

const { authMock, loadUserLibraryMock, resolveHltbForLibraryMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  loadUserLibraryMock: vi.fn(),
  resolveHltbForLibraryMock: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('@/lib/library/server', () => ({ loadUserLibrary: loadUserLibraryMock }))
vi.mock('@/lib/hltb/resolve', () => ({ resolveHltbForLibrary: resolveHltbForLibraryMock }))

beforeEach(() => {
  authMock.mockReset()
  loadUserLibraryMock.mockReset()
  resolveHltbForLibraryMock.mockReset()
})

import { GET } from '@/app/api/hltb/route'

const games: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 60, headerImageUrl: 'portal.jpg' },
]

describe('GET /api/hltb', () => {
  it('loads library server-side and resolves HLTB', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    loadUserLibraryMock.mockResolvedValueOnce({ games, cachedAt: 'cached' })
    resolveHltbForLibraryMock.mockResolvedValueOnce({ entries: { 1: null }, cachedAt: { 1: null }, meta: {} })

    const response = await GET(new Request('http://localhost/api/hltb'))

    expect(response.status).toBe(200)
    expect(loadUserLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', force: false })
    expect(resolveHltbForLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', games, force: false })
  })

  it('passes HLTB force without forcing Steam library refresh', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    loadUserLibraryMock.mockResolvedValueOnce({ games, cachedAt: 'cached' })
    resolveHltbForLibraryMock.mockResolvedValueOnce({ entries: {}, cachedAt: {}, meta: {} })

    await GET(new Request('http://localhost/api/hltb?force=1'))

    expect(loadUserLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', force: false })
    expect(resolveHltbForLibraryMock).toHaveBeenCalledWith({ steamId: 'steam-1', games, force: true })
  })

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null)

    const response = await GET(new Request('http://localhost/api/hltb'))

    expect(response.status).toBe(401)
  })
})
