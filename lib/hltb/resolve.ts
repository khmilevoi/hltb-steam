import * as kv from '@/lib/cache/kv'
import * as hltb from '@/lib/hltb/client'
import { noSyncNeeded } from '@/lib/hltb/sync-meta'
import type {
  Cached,
  HltbEntry,
  HltbMeta,
  HltbResponse,
  HltbSingleResponse,
  HltbSteamMapping,
  SteamGame,
} from '@/types/game'

type MappingMap = Map<number, HltbSteamMapping>

function warn(message: string, error: Error) {
  console.warn(message, error.message)
}

async function readMapping(appid: number): Promise<HltbSteamMapping | null> {
  const cached = await kv.getHltbMapping(appid)
  if (cached instanceof Error) {
    warn(`KV mapping read failed for ${appid}:`, cached)
    return null
  }
  return cached?.value ?? null
}

function snapshotCovers(
  snapshot: Cached<{ appids: number[]; refreshedAt: string }> | null,
  appids: number[],
): boolean {
  if (snapshot === null) return false
  if (kv.isExpired(snapshot.cachedAt, kv.HLTB_SNAPSHOT_TTL_MS)) return false
  const covered = new Set(snapshot.value.appids)
  return appids.every((appid) => covered.has(appid))
}

async function readMappingsForGames(games: SteamGame[]): Promise<MappingMap> {
  const mappings: MappingMap = new Map()
  for (const game of games) {
    const mapping = await readMapping(game.appid)
    if (mapping) mappings.set(game.appid, mapping)
  }
  return mappings
}

async function importMissingMappings({
  games,
  mappings,
  steamId,
}: {
  games: SteamGame[]
  mappings: MappingMap
  steamId: string
}) {
  const unmappedAppids = games
    .filter((game) => !mappings.has(game.appid))
    .map((game) => game.appid)
  if (unmappedAppids.length === 0) return mappings

  const snapshot = await kv.getHltbLibrarySnapshot(steamId)
  if (snapshot instanceof Error) {
    warn(`KV snapshot read failed for ${steamId}:`, snapshot)
  } else if (snapshotCovers(snapshot, unmappedAppids)) {
    return mappings
  }

  const imported = await hltb.fetchSteamImport(steamId)
  if (imported instanceof Error) {
    console.warn('HLTB Steam import failed:', imported.message)
    return mappings
  }

  const discoveredAt = new Date().toISOString()
  for (const item of imported) {
    const mapping: HltbSteamMapping = {
      steamAppId: item.steamAppId,
      hltbId: item.hltbId,
      hltbName: item.hltbName,
      discoveredFromSteamId: steamId,
      discoveredAt,
    }
    const writeResult = await kv.setHltbMapping(mapping)
    if (writeResult instanceof Error) warn(`KV mapping write failed for ${item.steamAppId}:`, writeResult)
  }

  const snapshotWrite = await kv.setHltbLibrarySnapshot(
    steamId,
    games.map((game) => game.appid),
  )
  if (snapshotWrite instanceof Error) warn(`KV snapshot write failed for ${steamId}:`, snapshotWrite)

  return readMappingsForGames(games)
}

async function resolveMappedGame({
  force,
  game,
  mapping,
}: {
  game: SteamGame
  mapping: HltbSteamMapping
  force: boolean
}): Promise<HltbSingleResponse> {
  const meta: HltbMeta = {
    source: 'steam-import',
    steamName: game.name,
    overrideName: null,
  }

  if (!force) {
    const cached = await kv.getHltbEntryById(mapping.hltbId)
    if (cached instanceof Error) {
      warn(`KV HLTB id read failed for ${mapping.hltbId}:`, cached)
    } else if (cached !== null) {
      return { entry: cached.value, cachedAt: cached.cachedAt, meta }
    }
  }

  const entry = await hltb.fetchById(mapping.hltbId)
  if (entry instanceof Error) {
    console.warn(`HLTB id lookup failed for ${mapping.hltbId}:`, entry.message)
    return { entry: null, cachedAt: null, meta }
  }

  const writeResult = await kv.setHltbEntryById(mapping.hltbId, entry)
  if (writeResult instanceof Error) warn(`KV HLTB id write failed for ${mapping.hltbId}:`, writeResult)
  return { entry, cachedAt: null, meta }
}

async function resolveFallbackGame({
  game,
  steamId,
}: {
  steamId: string
  game: SteamGame
}): Promise<HltbSingleResponse> {
  const override = await kv.getHltbOverrideName(steamId, game.appid)
  if (override instanceof Error) warn(`KV override read failed for ${game.appid}:`, override)

  const overrideName = override instanceof Error ? null : (override?.value.searchName ?? null)
  const searchName = overrideName ?? game.name
  const source = overrideName ? 'override-name' : 'steam-name'

  const entry = await hltb.searchByName(searchName)
  if (entry instanceof Error) {
    console.warn(`HLTB search failed for ${searchName}:`, entry.message)
    return {
      entry: null,
      cachedAt: null,
      meta: { source: 'none', steamName: game.name, overrideName },
    }
  }

  return {
    entry,
    cachedAt: null,
    meta: {
      source: entry === null ? 'none' : source,
      steamName: game.name,
      overrideName,
    },
  }
}

async function resolveGameWithMapping({
  force,
  game,
  mapping,
  steamId,
}: {
  steamId: string
  game: SteamGame
  force: boolean
  mapping: HltbSteamMapping | null
}) {
  if (mapping) return resolveMappedGame({ game, mapping, force })
  return resolveFallbackGame({ steamId, game })
}

export async function resolveHltbForGame({
  force,
  game,
  steamId,
}: {
  steamId: string
  game: SteamGame
  force: boolean
}): Promise<HltbSingleResponse> {
  const mapping = await readMapping(game.appid)
  return resolveGameWithMapping({ steamId, game, force, mapping })
}

export async function resolveHltbForLibrary({
  force,
  games,
  steamId,
}: {
  steamId: string
  games: SteamGame[]
  force: boolean
}): Promise<HltbResponse> {
  const initialMappings = await readMappingsForGames(games)
  const mappings = await importMissingMappings({ steamId, games, mappings: initialMappings })

  const entries: Record<number, HltbEntry | null> = {}
  const cachedAt: Record<number, string | null> = {}
  const meta: Record<number, HltbMeta> = {}

  for (const game of games) {
    const result = await resolveGameWithMapping({
      steamId,
      game,
      force,
      mapping: mappings.get(game.appid) ?? null,
    })
    entries[game.appid] = result.entry
    cachedAt[game.appid] = result.cachedAt
    meta[game.appid] = result.meta
  }

  return { entries, cachedAt, meta, sync: noSyncNeeded(games.length) }
}
