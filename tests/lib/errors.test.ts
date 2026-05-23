import * as errore from 'errore'
import { describe, expect, it } from 'vitest'
import {
  HltbApiError,
  HltbFetchError,
  HltbRateLimitError,
  KvError,
  LibraryFetchError,
  SteamPrivateProfileError,
  SteamUnavailableError,
  UnauthenticatedError,
} from '@/lib/errors'

describe('tagged errors', () => {
  it('SteamPrivateProfileError carries steamId', () => {
    const e = new SteamPrivateProfileError({ steamId: '76561198000000000' })
    expect(e).toBeInstanceOf(Error)
    expect(e._tag).toBe('SteamPrivateProfileError')
    expect(e.steamId).toBe('76561198000000000')
    expect(e.message).toContain('76561198000000000')
  })

  it('SteamUnavailableError carries reason', () => {
    const e = new SteamUnavailableError({ reason: 'HTTP 502' })
    expect(e._tag).toBe('SteamUnavailableError')
    expect(e.reason).toBe('HTTP 502')
  })

  it('HltbRateLimitError carries retryAfterMs', () => {
    const e = new HltbRateLimitError({ retryAfterMs: 10000 })
    expect(e.retryAfterMs).toBe(10000)
  })

  it('HltbFetchError carries name and reason', () => {
    const e = new HltbFetchError({ name: 'Dishonored', reason: 'search threw' })
    expect(e._tag).toBe('HltbFetchError')
    expect(e.message).toContain('Dishonored')
    expect(e.message).toContain('search threw')
  })

  it('KvError carries op and key', () => {
    const e = new KvError({ op: 'get', key: 'library:abc' })
    expect(e.op).toBe('get')
    expect(e.key).toBe('library:abc')
  })

  it('UnauthenticatedError tag is set', () => {
    const e = new UnauthenticatedError()
    expect(e._tag).toBe('UnauthenticatedError')
  })

  it('LibraryFetchError carries status and code', () => {
    const e = new LibraryFetchError({ status: 502, code: 'steam_unavailable' })
    expect(e.status).toBe(502)
    expect(e.code).toBe('steam_unavailable')
  })

  it('HltbApiError carries status and code', () => {
    const e = new HltbApiError({ status: 401, code: 'unauthenticated' })
    expect(e.status).toBe(401)
  })

  it('matchError routes by _tag', () => {
    const e = new SteamPrivateProfileError({ steamId: 'x' })
    const result = errore.matchError(e, {
      SteamPrivateProfileError: () => 'private',
      Error: () => 'other',
    })
    expect(result).toBe('private')
  })
})
