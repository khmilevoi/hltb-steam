import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KvError } from '@/lib/errors'

const {
  getItemMock,
  getKeysMock,
  removeItemMock,
  setItemMock,
  redisGetMock,
  redisSetMock,
  redisDelMock,
  redisKeysMock,
} = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  getKeysMock: vi.fn(),
  setItemMock: vi.fn(),
  removeItemMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisKeysMock: vi.fn(),
}))

vi.mock('unstorage', () => ({
  createStorage: () => ({
    getItem: getItemMock,
    getKeys: getKeysMock,
    setItem: setItemMock,
    removeItem: removeItemMock,
  }),
}))

vi.mock('unstorage/drivers/fs', () => ({ default: () => ({}) }))
vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = redisGetMock
    set = redisSetMock
    del = redisDelMock
    keys = redisKeysMock
  },
}))

beforeEach(() => {
  delete process.env.VERCEL
  getItemMock.mockReset()
  getKeysMock.mockReset()
  setItemMock.mockReset()
  removeItemMock.mockReset()
  redisGetMock.mockReset()
  redisSetMock.mockReset()
  redisDelMock.mockReset()
  redisKeysMock.mockReset()
  setItemMock.mockResolvedValue(undefined)
  removeItemMock.mockResolvedValue(undefined)
  redisGetMock.mockResolvedValue(null)
  redisSetMock.mockResolvedValue('OK')
  redisDelMock.mockResolvedValue(1)
  redisKeysMock.mockResolvedValue([])
})

import {
  deleteHltbOverrideName,
  getHltbEntryById,
  getHltbLibrarySnapshot,
  getHltbMapping,
  getHltbOverrideName,
  getHltbOverrideNames,
  getLibrary,
  setHltbEntryById,
  setHltbLibrarySnapshot,
  setHltbMapping,
  setHltbOverrideName,
  setLibrary,
} from '@/lib/cache/kv'

describe('local cache (unstorage fs)', () => {
  it('getLibrary returns null on cache miss', async () => {
    getItemMock.mockResolvedValueOnce(null)
    expect(await getLibrary('xx')).toBeNull()
  })

  it('getLibrary returns Cached payload when fresh', async () => {
    const fresh = new Date(Date.now() - 60_000).toISOString()
    getItemMock.mockResolvedValueOnce({ value: [], cachedAt: fresh })
    const result = await getLibrary('xx')
    expect(result).not.toBeNull()
    expect(result).not.toBeInstanceOf(Error)
    if (!result || result instanceof Error) return
    expect(result.cachedAt).toBe(fresh)
  })

  it('getLibrary returns null when entry is older than 1 hour', async () => {
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    getItemMock.mockResolvedValueOnce({ value: [], cachedAt: stale })
    expect(await getLibrary('xx')).toBeNull()
  })

  it('getLibrary returns KvError when storage throws', async () => {
    getItemMock.mockRejectedValueOnce(new Error('disk down'))
    const result = await getLibrary('xx')
    expect(result).toBeInstanceOf(KvError)
  })

  it('setLibrary writes a Cached<T> payload under library:xx', async () => {
    setItemMock.mockResolvedValueOnce(undefined)
    const result = await setLibrary('xx', [])
    expect(result).toBeUndefined()
    expect(setItemMock).toHaveBeenCalledWith(
      'library:xx',
      expect.objectContaining({ value: [], cachedAt: expect.any(String) }),
    )
  })

  it('setLibrary returns KvError on throw', async () => {
    setItemMock.mockRejectedValueOnce(new Error('boom'))
    const result = await setLibrary('xx', [])
    expect(result).toBeInstanceOf(KvError)
  })

  it('uses Upstash Redis instead of local fs storage on Vercel', async () => {
    process.env.VERCEL = '1'

    const result = await setLibrary('xx', [])

    expect(result).toBeUndefined()
    expect(redisSetMock).toHaveBeenCalledWith(
      'library:xx',
      expect.objectContaining({ value: [], cachedAt: expect.any(String) }),
    )
    expect(setItemMock).not.toHaveBeenCalled()
  })

  it('getHltbMapping/setHltbMapping use steam appid mapping keys', async () => {
    getItemMock.mockResolvedValueOnce(null)
    expect(await getHltbMapping(620)).toBeNull()
    expect(getItemMock).toHaveBeenCalledWith('hltb-map:steam-app:620')

    await setHltbMapping({
      steamAppId: 620,
      hltbId: 7230,
      hltbName: 'Portal',
      discoveredFromSteamId: 'steam-1',
      discoveredAt: '2026-05-24T00:00:00.000Z',
    })

    expect(setItemMock).toHaveBeenCalledWith(
      'hltb-map:steam-app:620',
      expect.objectContaining({
        value: expect.objectContaining({ steamAppId: 620, hltbId: 7230 }),
      }),
    )
  })

  it('getHltbEntryById/setHltbEntryById use hltb id keys with 7 day TTL', async () => {
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    getItemMock.mockResolvedValueOnce({ value: null, cachedAt: stale })

    expect(await getHltbEntryById(7230)).toBeNull()
    expect(getItemMock).toHaveBeenCalledWith('hltb-entry:hltb-id:7230')

    await setHltbEntryById(7230, {
      mainHours: 3,
      mainExtraHours: 5,
      completionistHours: 8,
      hltbId: 7230,
      matchedName: 'Portal',
    })

    expect(setItemMock).toHaveBeenCalledWith(
      'hltb-entry:hltb-id:7230',
      expect.objectContaining({ value: expect.objectContaining({ hltbId: 7230 }) }),
    )
  })

  it('stores, reads, and deletes user HLTB override names', async () => {
    getItemMock.mockResolvedValueOnce({
      value: { appid: 620, searchName: 'Portal 2007', updatedAt: 'now' },
      cachedAt: 'now',
    })

    expect(await getHltbOverrideName('steam-1', 620)).toEqual({
      value: { appid: 620, searchName: 'Portal 2007', updatedAt: 'now' },
      cachedAt: 'now',
    })
    expect(getItemMock).toHaveBeenCalledWith('hltb-override-name:steam-1:620')

    await setHltbOverrideName('steam-1', 620, '  Portal 2007  ')
    expect(setItemMock).toHaveBeenCalledWith(
      'hltb-override-name:steam-1:620',
      expect.objectContaining({
        value: expect.objectContaining({ appid: 620, searchName: 'Portal 2007' }),
      }),
    )

    await deleteHltbOverrideName('steam-1', 620)
    expect(removeItemMock).toHaveBeenCalledWith('hltb-override-name:steam-1:620')
  })

  it('lists user override names and ignores malformed values', async () => {
    getKeysMock.mockResolvedValueOnce([
      'hltb-override-name:steam-1:620',
      'hltb-override-name:steam-1:not-a-number',
      'other:key',
    ])
    getItemMock
      .mockResolvedValueOnce({ value: { appid: 620, searchName: 'Portal 2007' }, cachedAt: 'now' })
      .mockResolvedValueOnce({ value: { appid: 0, searchName: '' }, cachedAt: 'now' })

    const result = await getHltbOverrideNames('steam-1')

    expect(getKeysMock).toHaveBeenCalledWith('hltb-override-name:steam-1:')
    expect(result).toEqual({ 620: 'Portal 2007' })
  })

  it('writes and raw-reads HLTB library snapshots without TTL filtering', async () => {
    await setHltbLibrarySnapshot('steam-1', [1, 2])
    expect(setItemMock).toHaveBeenCalledWith(
      'hltb-library-snapshot:steam-1',
      expect.objectContaining({
        value: expect.objectContaining({ appids: [1, 2], refreshedAt: expect.any(String) }),
      }),
    )

    const stale = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    getItemMock.mockResolvedValueOnce({
      value: { appids: [1], refreshedAt: stale },
      cachedAt: stale,
    })

    expect(await getHltbLibrarySnapshot('steam-1')).toEqual({
      value: { appids: [1], refreshedAt: stale },
      cachedAt: stale,
    })
  })
})
