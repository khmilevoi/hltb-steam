import { describe, expect, it } from 'vitest'
import { mergeGames } from '@/lib/library/merge'
import type { HltbEntry, HltbMeta, SteamGame } from '@/types/game'

const steamGames: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 600, headerImageUrl: 'a' },
  { appid: 2, name: 'Hades', playtimeMinutes: 0, headerImageUrl: 'b' },
]

const hltb: Record<number, HltbEntry | null> = {
  1: { mainHours: 3, mainExtraHours: 5, completionistHours: 10, hltbId: 11, matchedName: 'Portal' },
  2: null,
}

const meta: Record<number, HltbMeta> = {
  1: { source: 'steam-import', steamName: 'Portal', overrideName: null },
  2: { source: 'none', steamName: 'Hades', overrideName: null },
}

describe('mergeGames', () => {
  it('attaches hltb entry by appid', () => {
    const rows = mergeGames(steamGames, hltb)
    expect(rows[0].hltb?.mainHours).toBe(3)
  })

  it('attaches null when no hltb entry for that appid', () => {
    const rows = mergeGames(steamGames, hltb)
    expect(rows[1].hltb).toBeNull()
  })

  it('treats missing keys in the map as null', () => {
    const rows = mergeGames(steamGames, {})
    expect(rows.every((row) => row.hltb === null)).toBe(true)
  })

  it('attaches hltb metadata by appid', () => {
    const rows = mergeGames(steamGames, hltb, meta)
    expect(rows[0].hltbMeta).toEqual({
      source: 'steam-import',
      steamName: 'Portal',
      overrideName: null,
    })
  })

  it('keeps hltb metadata null when missing', () => {
    const rows = mergeGames(steamGames, hltb, {})
    expect(rows.every((row) => row.hltbMeta === null)).toBe(true)
  })

  it('returns empty array for empty steam input', () => {
    expect(mergeGames([], hltb)).toEqual([])
  })
})
