import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { KvError } from '@/lib/errors'
import { normalizeName } from '@/lib/hltb/matcher'
import type { Cached, HltbEntry, SteamGame } from '@/types/game'

const storage = createStorage({
  driver: fsDriver({ base: './.cache' }),
})

const LIBRARY_TTL_MS = 60 * 60 * 1000
const HLTB_TTL_MS = 7 * 24 * 60 * 60 * 1000

function libraryKey(steamId: string) {
  return `library:${steamId}`
}

function hltbKey(name: string) {
  return `hltb:v2:${normalizeName(name)}`
}

function isExpired(cachedAt: string, ttlMs: number): boolean {
  const age = Date.now() - new Date(cachedAt).getTime()
  return Number.isNaN(age) || age >= ttlMs
}

async function get<T>(key: string, ttlMs: number): Promise<KvError | Cached<T> | null> {
  const raw = await storage.getItem(key).catch(
    (error) => new KvError({ op: 'get', key, cause: error }),
  )
  if (raw instanceof Error) return raw
  if (raw === null) return null
  const cached = raw as Cached<T>
  if (isExpired(cached.cachedAt, ttlMs)) return null
  return cached
}

async function set<T>(key: string, value: T): Promise<KvError | void> {
  const payload: Cached<T> = { value, cachedAt: new Date().toISOString() }
  const result = await storage.setItem(key, payload).catch(
    (error) => new KvError({ op: 'set', key, cause: error }),
  )
  if (result instanceof Error) return result
}

export function getLibrary(steamId: string) {
  return get<SteamGame[]>(libraryKey(steamId), LIBRARY_TTL_MS)
}

export function setLibrary(steamId: string, games: SteamGame[]) {
  return set(libraryKey(steamId), games)
}

export function getHltb(name: string) {
  return get<HltbEntry | null>(hltbKey(name), HLTB_TTL_MS)
}

export function setHltb(name: string, entry: HltbEntry | null) {
  return set(hltbKey(name), entry)
}
