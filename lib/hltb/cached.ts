import * as kv from '@/lib/cache/kv'
import { cachedSyncMeta } from '@/lib/hltb/sync-meta'
import type {
  Cached,
  HltbEntry,
  HltbMeta,
  HltbResponse,
  HltbSteamMapping,
  SteamGame,
} from '@/types/game'

type CachedGameResult =
  | { status: 'cached'; entry: HltbEntry | null; cachedAt: string; meta: HltbMeta; stale: boolean }
  | { status: 'missing' | 'stale' }

function isFresh(cachedAt: string) {
  return !kv.isExpired(cachedAt, kv.HLTB_TTL_MS)
}

function warn(message: string, error: Error) {
  console.warn(message, error.message)
}

async function readOverrideName(steamId: string, game: SteamGame): Promise<string | null> {
  const override = await kv.getHltbOverrideName(steamId, game.appid)
  if (override instanceof Error) {
    warn(`KV override read failed for ${game.appid}:`, override)
    return null
  }
  return override?.value.searchName ?? null
}

async function resolveCachedMappedGame(
  game: SteamGame,
  mapping: Cached<HltbSteamMapping>,
): Promise<CachedGameResult> {
  const entry = await kv.getHltbEntryByIdRaw(mapping.value.hltbId)
  if (entry instanceof Error) {
    warn(`KV HLTB id read failed for ${mapping.value.hltbId}:`, entry)
    return { status: 'missing' }
  }
  const mappingStale = !isFresh(mapping.cachedAt)
  if (entry === null) return mappingStale ? { status: 'stale' } : { status: 'missing' }
  const stale = mappingStale || !isFresh(entry.cachedAt)

  return {
    status: 'cached',
    entry: entry.value,
    cachedAt: entry.cachedAt,
    meta: { source: 'steam-import', steamName: game.name, overrideName: null },
    stale,
  }
}

async function resolveCachedFallbackGame({
  game,
  steamId,
}: {
  steamId: string
  game: SteamGame
}): Promise<CachedGameResult> {
  const overrideName = await readOverrideName(steamId, game)
  const searchName = overrideName ?? game.name
  const fallback = await kv.getHltbFallbackResultRaw(steamId, game.appid)

  if (fallback instanceof Error) {
    warn(`KV fallback read failed for ${game.appid}:`, fallback)
    return { status: 'missing' }
  }
  if (fallback === null) return { status: 'missing' }
  if (fallback.value.searchName !== searchName) return { status: 'missing' }
  const stale = !isFresh(fallback.cachedAt)

  return {
    status: 'cached',
    entry: fallback.value.entry,
    cachedAt: fallback.cachedAt,
    meta: {
      source: fallback.value.entry === null ? 'none' : fallback.value.source,
      steamName: game.name,
      overrideName,
    },
    stale,
  }
}

export async function resolveCachedHltbForLibrary({
  games,
  steamId,
}: {
  steamId: string
  games: SteamGame[]
}): Promise<HltbResponse> {
  const entries: Record<number, HltbEntry | null> = {}
  const cachedAt: Record<number, string | null> = {}
  const meta: Record<number, HltbMeta> = {}
  const missingAppids: number[] = []
  const staleAppids: number[] = []
  let cachedCount = 0

  for (const game of games) {
    const mapping = await kv.getHltbMappingRaw(game.appid)
    const result =
      mapping instanceof Error
        ? (() => {
            warn(`KV mapping read failed for ${game.appid}:`, mapping)
            return { status: 'missing' as const }
          })()
        : mapping
          ? await resolveCachedMappedGame(game, mapping)
          : await resolveCachedFallbackGame({ steamId, game })

    if (result.status === 'cached') {
      entries[game.appid] = result.entry
      cachedAt[game.appid] = result.cachedAt
      meta[game.appid] = result.meta
      cachedCount += 1
      if (result.stale) staleAppids.push(game.appid)
    } else {
      entries[game.appid] = null
      cachedAt[game.appid] = null
      if (result.status === 'stale') staleAppids.push(game.appid)
      else missingAppids.push(game.appid)
    }
  }

  return {
    entries,
    cachedAt,
    meta,
    sync: cachedSyncMeta({ cachedCount, missingAppids, staleAppids, totalCount: games.length }),
  }
}
