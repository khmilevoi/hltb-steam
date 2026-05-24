import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { KvError } from '@/lib/errors'
import { normalizeName } from '@/lib/hltb/matcher'
import type {
  Cached,
  HltbEntry,
  HltbLibrarySnapshot,
  HltbOverrideName,
  HltbSteamMapping,
  SteamGame,
} from '@/types/game'

const storage = createStorage({
  driver: fsDriver({ base: './.cache' }),
})

const LIBRARY_TTL_MS = 60 * 60 * 1000
const HLTB_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const HLTB_SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000

function libraryKey(steamId: string) {
  return `library:${steamId}`
}

function hltbKey(name: string) {
  return `hltb:v2:${normalizeName(name)}`
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
  const raw = await storage.getItem(key).catch(
    (error) => new KvError({ op: 'get', key, cause: error }),
  )
  if (raw instanceof Error) return raw
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
  const result = await storage.setItem(key, payload).catch(
    (error) => new KvError({ op: 'set', key, cause: error }),
  )
  if (result instanceof Error) return result
}

async function remove(key: string): Promise<KvError | void> {
  const result = await storage.removeItem(key).catch(
    (error) => new KvError({ op: 'remove', key, cause: error }),
  )
  if (result instanceof Error) return result
}

async function getKeys(base: string): Promise<KvError | string[]> {
  const keys = await storage.getKeys(base).catch(
    (error) => new KvError({ op: 'getKeys', key: base, cause: error }),
  )
  if (keys instanceof Error) return keys
  return keys
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
