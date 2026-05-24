import * as kv from '@/lib/cache/kv'
import * as steam from '@/lib/steam/client'
import type { SteamGame } from '@/types/game'

export type LoadUserLibraryResult =
  | {
      games: SteamGame[]
      cachedAt: string | null
    }
  | Error

export async function loadUserLibrary({
  force,
  steamId,
}: {
  steamId: string
  force: boolean
}): Promise<LoadUserLibraryResult> {
  if (!force) {
    const cached = await kv.getLibrary(steamId)
    if (cached instanceof Error) {
      console.warn('KV read failed:', cached.message)
    } else if (cached !== null) {
      return { games: cached.value, cachedAt: cached.cachedAt }
    }
  }

  const games = await steam.getOwnedGames(steamId)
  if (games instanceof Error) return games

  const writeResult = await kv.setLibrary(steamId, games)
  if (writeResult instanceof Error) {
    console.warn('KV write failed:', writeResult.message)
  }

  return { games, cachedAt: null }
}
