import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getOwnedGames } from '@/lib/steam/client'
import { SteamPrivateProfileError, SteamUnavailableError } from '@/lib/errors'

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getOwnedGames', () => {
  it('parses a populated library', async () => {
    mockFetchOnce({
      response: {
        game_count: 2,
        games: [
          { appid: 1, name: 'Portal', playtime_forever: 600 },
          { appid: 2, name: 'Hades', playtime_forever: 0 },
        ],
      },
    })
    const result = await getOwnedGames('76561198000000000')
    expect(Array.isArray(result)).toBe(true)
    if (!Array.isArray(result)) return
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      appid: 1,
      name: 'Portal',
      playtimeMinutes: 600,
      headerImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg',
    })
  })

  it('returns SteamPrivateProfileError on empty response', async () => {
    mockFetchOnce({ response: {} })
    const result = await getOwnedGames('76561198000000000')
    expect(result).toBeInstanceOf(SteamPrivateProfileError)
    if (result instanceof SteamPrivateProfileError) {
      expect(result.steamId).toBe('76561198000000000')
    }
  })

  it('returns SteamUnavailableError on HTTP 5xx', async () => {
    mockFetchOnce({}, { status: 502 })
    const result = await getOwnedGames('76561198000000000')
    expect(result).toBeInstanceOf(SteamUnavailableError)
  })

  it('returns SteamUnavailableError on fetch throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const result = await getOwnedGames('76561198000000000')
    expect(result).toBeInstanceOf(SteamUnavailableError)
  })

  it('returns SteamUnavailableError on invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 200 })))
    const result = await getOwnedGames('76561198000000000')
    expect(result).toBeInstanceOf(SteamUnavailableError)
  })
})
