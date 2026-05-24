import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HltbFetchError, HltbRateLimitError } from '@/lib/errors'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))

vi.mock('howlongtobeat', () => {
  return {
    HowLongToBeatService: class {
      search = searchMock
    },
  }
})

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  searchMock.mockReset()
  searchMock.mockRejectedValue(new Error('Request failed with status code 404'))
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

import { fetchById, fetchSteamImport, searchByName } from '@/lib/hltb/client'

describe('searchByName (hltb client)', () => {
  it('returns a matched entry', async () => {
    searchMock.mockRejectedValueOnce(new Error('Request failed with status code 404'))
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          token: 'token-1',
          hpKey: 'ign_test',
          hpVal: 'hp-value',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              game_id: 10,
              game_name: 'The Witcher 3: Wild Hunt',
              comp_main: 52 * 3600,
              comp_plus: 105 * 3600,
              comp_100: 180 * 3600,
            },
          ],
        }),
      )

    const result = await searchByName('Witcher 3')

    expect(result).not.toBeNull()
    expect(result).not.toBeInstanceOf(Error)
    if (result === null || result instanceof Error) return
    expect(result.hltbId).toBe(10)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch('/api/bleed/init')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://howlongtobeat.com/api/bleed')
    const request = fetchMock.mock.calls[1]?.[1]
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-auth-token': 'token-1',
      'x-hp-key': 'ign_test',
      'x-hp-val': 'hp-value',
    })
    expect(JSON.parse(String(request?.body))).toMatchObject({
      searchType: 'games',
      searchTerms: ['Witcher', '3'],
      ign_test: 'hp-value',
    })
  })

  it('preserves sub-hour durations with minute precision', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ token: 'token-1' }))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              game_id: 10,
              game_name: 'Buckshot Roulette',
              comp_main: 15 * 60,
              comp_plus: 2 * 3600,
              comp_100: 10 * 3600,
            },
          ],
        }),
      )

    const result = await searchByName('Buckshot Roulette')

    expect(result).not.toBeNull()
    expect(result).not.toBeInstanceOf(Error)
    if (result === null || result instanceof Error) return
    expect(result.mainHours).toBe(0.25)
  })

  it('returns null when no candidates', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ token: 'token-1' }))
      .mockResolvedValueOnce(Response.json({ data: [] }))

    const result = await searchByName('Some Obscure Game')

    expect(result).toBeNull()
  })

  it('returns null when no candidate clears similarity threshold', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ token: 'token-1' }))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              game_id: 1,
              game_name: 'Completely Unrelated',
              comp_main: 3600,
              comp_plus: 7200,
              comp_100: 10800,
            },
          ],
        }),
      )

    const result = await searchByName('Witcher 3')

    expect(result).toBeNull()
  })

  it('returns HltbRateLimitError on a 429 response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))

    const result = await searchByName('Anything')

    expect(result).toBeInstanceOf(HltbRateLimitError)
  })

  it('returns HltbFetchError on other failed responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }))

    const result = await searchByName('Anything')

    expect(result).toBeInstanceOf(HltbFetchError)
  })
})

describe('fetchSteamImport', () => {
  it('posts to HLTB Steam import endpoint and maps valid rows', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        games: [
          {
            steam_id: 620,
            hltb_id: 7230,
            hltb_name: 'Portal',
            hltb_time: 10800,
          },
          { steam_id: 'bad', hltb_id: 1, hltb_name: 'Bad' },
        ],
      }),
    )

    const result = await fetchSteamImport('steam-1')

    expect(result).toEqual([{ steamAppId: 620, hltbId: 7230, hltbName: 'Portal' }])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://howlongtobeat.com/api/steam/getSteamImportData',
      expect.objectContaining({
        body: JSON.stringify({ steamUserId: 'steam-1', steamOmitData: 0 }),
        method: 'POST',
      }),
    )
  })

  it('returns HltbFetchError when import response has error', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'private' }))

    const result = await fetchSteamImport('steam-1')

    expect(result).toBeInstanceOf(HltbFetchError)
  })
})

describe('fetchById', () => {
  it('fetches Next game data and maps details to an HLTB entry', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('<script>{"buildId":"build-1"}</script>'))
      .mockResolvedValueOnce(
        Response.json({
          pageProps: {
            game: {
              data: {
                game: [
                  {
                    game_id: 7230,
                    game_name: 'Portal',
                    comp_main: 3 * 3600,
                    comp_plus: 5 * 3600,
                    comp_100: 8 * 3600,
                  },
                ],
              },
            },
          },
        }),
      )

    const result = await fetchById(7230)

    expect(result).toEqual({
      mainHours: 3,
      mainExtraHours: 5,
      completionistHours: 8,
      hltbId: 7230,
      matchedName: 'Portal',
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://howlongtobeat.com/_next/data/build-1/game/7230.json',
    )
  })

  it('returns null for a valid empty game array', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('<script>{"buildId":"build-1"}</script>'))
      .mockResolvedValueOnce(
        Response.json({ pageProps: { game: { data: { game: [] } } } }),
      )

    expect(await fetchById(7230)).toBeNull()
  })

  it('returns HltbFetchError on malformed data', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('<script>{"buildId":"build-1"}</script>'))
      .mockResolvedValueOnce(Response.json({ nope: true }))

    const result = await fetchById(7230)

    expect(result).toBeInstanceOf(HltbFetchError)
  })

  it('returns HltbRateLimitError when the details response is 429', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('<script>{"buildId":"build-1"}</script>'))
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))

    const result = await fetchById(7230)

    expect(result).toBeInstanceOf(HltbRateLimitError)
  })
})
