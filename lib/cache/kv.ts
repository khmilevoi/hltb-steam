import { Redis } from '@upstash/redis'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { KvError } from '@/lib/errors'
import type {
  Cached,
  HltbEntry,
  HltbLibrarySnapshot,
  HltbOverrideName,
  HltbSteamMapping,
  SteamGame,
} from '@/types/game'

const fsStorage = createStorage({
  driver: fsDriver({ base: './.cache' }),
})

type StorageAdapter = {
  getItem: (key: string) => Promise<unknown | null>
  getKeys?: (base: string) => Promise<string[]>
  removeItem: (key: string) => Promise<void>
  setItem: (key: string, value: unknown) => Promise<void>
}

let _redis: Redis | null = null

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  }
  return _redis
}

function isVercel(): boolean {
  return process.env.VERCEL === '1'
}

function getStorage(): StorageAdapter {
  if (!isVercel()) return fsStorage

  const redis = getRedis()
  return {
    getItem: (key) => redis.get(key),
    getKeys: (base) => redis.keys(`${base}*`),
    removeItem: async (key) => { await redis.del(key) },
    setItem: async (key, value) => { await redis.set(key, value) },
  }
}

const LIBRARY_TTL_MS = 60 * 60 * 1000
const HLTB_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const HLTB_SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000

function libraryKey(steamId: string) {
  return `library:${steamId}`
}

function hltbMappingKey(appid: number) {
  return `hltb-map:steam-app:${appid}`
}

function hltbEntryByIdKey(hltbId: number) {
  return `hltb-entry:hltb-id:${hltbId}`
}

function hltbOverrideNameKey(steamId: string, appid: number) {
  return `hltb-override-name:${steamId}:${appid}`
}

function hltbOverrideNamePrefix(steamId: string) {
  return `hltb-override-name:${steamId}:`
}

function hltbLibrarySnapshotKey(steamId: string) {
  return `hltb-library-snapshot:${steamId}`
}

export function isExpired(cachedAt: string, ttlMs: number): boolean {
  const age = Date.now() - new Date(cachedAt).getTime()
  return Number.isNaN(age) || age >= ttlMs
}

async function getRaw<T>(key: string): Promise<KvError | Cached<T> | null> {
  let raw: unknown | null
  try {
    raw = await getStorage().getItem(key)
  } catch (error) {
    return new KvError({ op: 'get', key, cause: error })
  }
  if (raw === null) return null
  return raw as Cached<T>
}

async function get<T>(key: string, ttlMs: number): Promise<KvError | Cached<T> | null> {
  const raw = await getRaw<T>(key)
  if (raw instanceof Error) return raw
  if (raw === null) return null
  if (isExpired(raw.cachedAt, ttlMs)) return null
  return raw
}

async function set<T>(key: string, value: T): Promise<KvError | void> {
  const payload: Cached<T> = { value, cachedAt: new Date().toISOString() }
  try {
    await getStorage().setItem(key, payload)
  } catch (error) {
    return new KvError({ op: 'set', key, cause: error })
  }
}

async function remove(key: string): Promise<KvError | void> {
  try {
    await getStorage().removeItem(key)
  } catch (error) {
    return new KvError({ op: 'remove', key, cause: error })
  }
}

async function getKeys(base: string): Promise<KvError | string[]> {
  const storage = getStorage()
  if (!storage.getKeys) return new KvError({ op: 'getKeys', key: base })

  try {
    return await storage.getKeys(base)
  } catch (error) {
    return new KvError({ op: 'getKeys', key: base, cause: error })
  }
}

export function getLibrary(steamId: string) {
  return get<SteamGame[]>(libraryKey(steamId), LIBRARY_TTL_MS)
}

export function setLibrary(steamId: string, games: SteamGame[]) {
  return set(libraryKey(steamId), games)
}

export function getHltbMapping(appid: number) {
  return get<HltbSteamMapping>(hltbMappingKey(appid), HLTB_TTL_MS)
}

export function setHltbMapping(mapping: HltbSteamMapping) {
  return set(hltbMappingKey(mapping.steamAppId), mapping)
}

export function getHltbEntryById(hltbId: number) {
  return get<HltbEntry | null>(hltbEntryByIdKey(hltbId), HLTB_TTL_MS)
}

export function setHltbEntryById(hltbId: number, entry: HltbEntry | null) {
  return set(hltbEntryByIdKey(hltbId), entry)
}

export function getHltbOverrideName(steamId: string, appid: number) {
  return getRaw<HltbOverrideName>(hltbOverrideNameKey(steamId, appid))
}

export function setHltbOverrideName(steamId: string, appid: number, searchName: string) {
  return set(hltbOverrideNameKey(steamId, appid), {
    appid,
    searchName: searchName.trim(),
    updatedAt: new Date().toISOString(),
  })
}

export function deleteHltbOverrideName(steamId: string, appid: number) {
  return remove(hltbOverrideNameKey(steamId, appid))
}

export async function getHltbOverrideNames(steamId: string): Promise<KvError | Record<number, string>> {
  const prefix = hltbOverrideNamePrefix(steamId)
  const keys = await getKeys(prefix)
  if (keys instanceof Error) return keys

  const overrides: Record<number, string> = {}
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue
    const appid = Number(key.slice(prefix.length))
    if (!Number.isInteger(appid) || appid <= 0) continue

    const cached = await getRaw<HltbOverrideName>(key)
    if (cached instanceof Error || cached === null) continue
    const value = cached.value
    if (value.appid !== appid || typeof value.searchName !== 'string' || value.searchName === '') {
      continue
    }
    overrides[appid] = value.searchName
  }

  return overrides
}

export function getHltbLibrarySnapshot(steamId: string) {
  return getRaw<HltbLibrarySnapshot>(hltbLibrarySnapshotKey(steamId))
}

export function setHltbLibrarySnapshot(steamId: string, appids: number[]) {
  const now = new Date().toISOString()
  return set(hltbLibrarySnapshotKey(steamId), {
    appids,
    refreshedAt: now,
  })
}
