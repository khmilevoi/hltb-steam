import type { GameRow, HltbEntry, SteamGame } from '@/types/game'

export function mergeGames(
  games: SteamGame[],
  hltb: Record<number, HltbEntry | null>,
): GameRow[] {
  return games.map((game) => ({ ...game, hltb: hltb[game.appid] ?? null }))
}
