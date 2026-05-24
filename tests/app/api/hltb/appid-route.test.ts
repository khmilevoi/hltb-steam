import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SteamGame } from '@/types/game'

const { authMock, loadUserLibraryMock, resolveHltbForGameMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  loadUserLibraryMock: vi.fn(),
  resolveHltbForGameMock: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('@/lib/library/server', () => ({ loadUserLibrary: loadUserLibraryMock }))
vi.mock('@/lib/hltb/resolve', () => ({ resolveHltbForGame: resolveHltbForGameMock }))

beforeEach(() => {
  authMock.mockReset()
  loadUserLibraryMock.mockReset()
  resolveHltbForGameMock.mockReset()
})

import { GET } from '@/app/api/hltb/[appid]/route'

const game: SteamGame = {
  appid: 1,
  name: 'Portal',
  playtimeMinutes: 60,
  headerImageUrl: 'portal.jpg',
}

describe('GET /api/hltb/[appid]', () => {
  it('returns 400 for invalid appid', async () => {
    const response = await GET(new Request('http://localhost/api/hltb/nope'), {
      params: Promise.resolve({ appid: 'nope' }),
    })

    expect(response.status).toBe(400)
  })

  it('returns 404 when appid is not in the current library', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    loadUserLibraryMock.mockResolvedValueOnce({ games: [], cachedAt: null })

    const response = await GET(new Request('http://localhost/api/hltb/1'), {
      params: Promise.resolve({ appid: '1' }),
    })

    expect(response.status).toBe(404)
  })

  it('resolves one current-library game', async () => {
    authMock.mockResolvedValueOnce({ user: { steamId: 'steam-1' } })
    loadUserLibraryMock.mockResolvedValueOnce({ games: [game], cachedAt: null })
    resolveHltbForGameMock.mockResolvedValueOnce({
      entry: null,
      cachedAt: null,
      meta: { source: 'none', steamName: 'Portal', overrideName: null },
    })

    const response = await GET(new Request('http://localhost/api/hltb/1?force=1'), {
      params: Promise.resolve({ appid: '1' }),
    })

    expect(response.status).toBe(200)
    expect(resolveHltbForGameMock).toHaveBeenCalledWith({
      steamId: 'steam-1',
      game,
      force: true,
    })
  })
})
