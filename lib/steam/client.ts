import { env } from '@/lib/env'
import { SteamPrivateProfileError, SteamUnavailableError } from '@/lib/errors'
import type { SteamGame } from '@/types/game'

type SteamApiGame = { appid: number; name: string; playtime_forever: number }
type SteamApiResponse = { response: { game_count?: number; games?: SteamApiGame[] } }

function toSteamGame(game: SteamApiGame): SteamGame {
  return {
    appid: game.appid,
    name: game.name,
    playtimeMinutes: game.playtime_forever,
    headerImageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
  }
}

export async function getOwnedGames(steamId: string) {
  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
    `?key=${env.STEAM_API_KEY}&steamid=${steamId}` +
    `&include_appinfo=1&include_played_free_games=1`

  const res = await fetch(url).catch(
    (error) => new SteamUnavailableError({ reason: 'fetch failed', cause: error }),
  )
  if (res instanceof Error) return res
  if (!res.ok) return new SteamUnavailableError({ reason: `HTTP ${res.status}` })

  const body = (await res.json().catch(
    (error) => new SteamUnavailableError({ reason: 'invalid JSON', cause: error }),
  )) as SteamApiResponse | SteamUnavailableError
  if (body instanceof Error) return body

  const games = body.response.games
  if (!games || games.length === 0) {
    return new SteamPrivateProfileError({ steamId })
  }

  return games.map(toSteamGame)
}
