import type { GameRow, HltbEntry, HltbMeta, SteamGame } from '@/types/game'

export function mergeGames(
  games: SteamGame[],
  hltb: Record<number, HltbEntry | null>,
  meta: Record<number, HltbMeta> = {},
): GameRow[] {
  return games.map((game) => ({
    ...game,
    hltb: hltb[game.appid] ?? null,
    hltbMeta: meta[game.appid] ?? null,
  }))
}
