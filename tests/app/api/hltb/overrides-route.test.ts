import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KvError } from '@/lib/errors'
import type { SteamGame } from '@/types/game'

const {
  authMock,
  deleteHltbOverrideNameMock,
  getHltbMappingMock,
  loadUserLibraryMock,
  setHltbOverrideNameMock,
  touchHltbUserStateMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  deleteHltbOverrideNameMock: vi.fn(),
  getHltbMappingMock: vi.fn(),
  loadUserLibraryMock: vi.fn(),
  setHltbOverrideNameMock: vi.fn(),
  touchHltbUserStateMock: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('@/lib/library/server', () => ({ loadUserLibrary: loadUserLibraryMock }))
vi.mock('@/lib/cache/kv', () => ({
  deleteHltbOverrideName: deleteHltbOverrideNameMock,
  getHltbMapping: getHltbMappingMock,
  setHltbOverrideName: setHltbOverrideNameMock,
  touchHltbUserState: touchHltbUserStateMock,
}))

beforeEach(() => {
  authMock.mockReset()
  deleteHltbOverrideNameMock.mockReset()
  getHltbMappingMock.mockReset()
  loadUserLibraryMock.mockReset()
  setHltbOverrideNameMock.mockReset()
  touchHltbUserStateMock.mockReset()
  authMock.mockResolvedValue({ user: { steamId: 'steam-1' } })
  getHltbMappingMock.mockResolvedValue(null)
  deleteHltbOverrideNameMock.mockResolvedValue(undefined)
  setHltbOverrideNameMock.mockResolvedValue(undefined)
  touchHltbUserStateMock.mockResolvedValue({
    revision: 'revision-1',
    updatedAt: '2026-06-02T10:00:00.000Z',
  })
})

import { PUT } from '@/app/api/hltb/overrides/[appid]/route'

const game: SteamGame = {
  appid: 1,
  name: 'Portal',
  playtimeMinutes: 60,
  headerImageUrl: 'portal.jpg',
}

function put(searchName: unknown, appid = '1') {
  return PUT(
    new Request(`http://localhost/api/hltb/overrides/${appid}`, {
      body: JSON.stringify({ searchName }),
      method: 'PUT',
    }),
    { params: Promise.resolve({ appid }) },
  )
}

describe('PUT /api/hltb/overrides/[appid]', () => {
  it('returns 400 for invalid JSON or body shape', async () => {
    let response = await PUT(
      new Request('http://localhost/api/hltb/overrides/1', { body: '{', method: 'PUT' }),
      { params: Promise.resolve({ appid: '1' }) },
    )
    expect(response.status).toBe(400)
    expect(touchHltbUserStateMock).not.toHaveBeenCalled()

    response = await put(123)
    expect(response.status).toBe(400)
    expect(touchHltbUserStateMock).not.toHaveBeenCalled()
  })

  it('returns 404 when appid is not in library', async () => {
    loadUserLibraryMock.mockResolvedValueOnce({ games: [], cachedAt: null })

    const response = await put('Portal 2007')

    expect(response.status).toBe(404)
    expect(touchHltbUserStateMock).not.toHaveBeenCalled()
  })

  it('returns 409 when mapping exists', async () => {
    loadUserLibraryMock.mockResolvedValueOnce({ games: [game], cachedAt: null })
    getHltbMappingMock.mockResolvedValueOnce({
      value: { steamAppId: 1, hltbId: 7230, hltbName: 'Portal' },
      cachedAt: 'now',
    })

    const response = await put('Portal 2007')

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'mapping_exists' })
    expect(touchHltbUserStateMock).not.toHaveBeenCalled()
  })

  it('stores trimmed override and deletes blank or Steam-name-equivalent values', async () => {
    loadUserLibraryMock.mockResolvedValue({ games: [game], cachedAt: null })

    expect((await put('  Portal 2007  ')).status).toBe(204)
    expect(setHltbOverrideNameMock).toHaveBeenCalledWith('steam-1', 1, 'Portal 2007')
    expect(touchHltbUserStateMock).toHaveBeenCalledWith('steam-1')

    expect((await put('Portal')).status).toBe(204)
    expect((await put('   ')).status).toBe(204)
    expect(deleteHltbOverrideNameMock).toHaveBeenCalledTimes(2)
    expect(touchHltbUserStateMock).toHaveBeenCalledTimes(3)
  })

  it('does not touch state when override write fails', async () => {
    loadUserLibraryMock.mockResolvedValue({ games: [game], cachedAt: null })
    setHltbOverrideNameMock.mockResolvedValueOnce(new KvError({ op: 'set', key: 'x' }))

    const response = await put('Portal 2007')

    expect(response.status).toBe(500)
    expect(touchHltbUserStateMock).not.toHaveBeenCalled()
  })

  it('returns 500 when touching state fails after override mutation', async () => {
    loadUserLibraryMock.mockResolvedValue({ games: [game], cachedAt: null })
    touchHltbUserStateMock.mockResolvedValueOnce(new KvError({ op: 'set', key: 'x' }))

    const response = await put('Portal 2007')

    expect(response.status).toBe(500)
    expect(touchHltbUserStateMock).toHaveBeenCalledWith('steam-1')
  })
})
