import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KvError } from '@/lib/errors'

const { getItemMock, removeItemMock, setItemMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  setItemMock: vi.fn(),
  removeItemMock: vi.fn(),
}))

vi.mock('unstorage', () => ({
  createStorage: () => ({
    getItem: getItemMock,
    setItem: setItemMock,
    removeItem: removeItemMock,
  }),
}))

vi.mock('unstorage/drivers/fs', () => ({ default: () => ({}) }))

beforeEach(() => {
  getItemMock.mockReset()
  setItemMock.mockReset()
  removeItemMock.mockReset()
})

import { getHltb, getLibrary, setHltb, setLibrary } from '@/lib/cache/kv'

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

  it('getHltb/setHltb use normalized name in key', async () => {
    getItemMock.mockResolvedValueOnce(null)
    expect(await getHltb('Witcher 3')).toBeNull()
    expect(getItemMock).toHaveBeenCalledWith('hltb:witcher 3')

    setItemMock.mockResolvedValueOnce(undefined)
    await setHltb('Witcher 3', null)
    expect(setItemMock).toHaveBeenCalledWith(
      'hltb:witcher 3',
      expect.objectContaining({ value: null }),
    )
  })

  it('getHltb returns null when entry is older than 7 days', async () => {
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    getItemMock.mockResolvedValueOnce({ value: null, cachedAt: stale })
    expect(await getHltb('Witcher 3')).toBeNull()
  })
})
