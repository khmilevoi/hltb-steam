import { describe, expect, it } from 'vitest'
import { sortRows } from '@/components/library-table/use-sorted-rows'
import type { GameRow } from '@/types/game'

function game(overrides: Partial<GameRow> & { name: string; appid: number }): GameRow {
  const { appid, name, ...rest } = overrides
  return {
    appid,
    name,
    playtimeMinutes: 0,
    headerImageUrl: '',
    hltb: null,
    hltbMeta: null,
    ...rest,
  }
}

const rowA = game({ appid: 1, name: 'Alpha', playtimeMinutes: 120 })
const rowB = game({
  appid: 2,
  name: 'Bravo',
  playtimeMinutes: 60,
  hltb: { mainHours: 5, mainExtraHours: 10, completionistHours: 20, hltbId: 1, matchedName: 'Bravo' },
})
const rowC = game({
  appid: 3,
  name: 'Charlie',
  playtimeMinutes: 180,
  hltb: { mainHours: 15, mainExtraHours: 25, completionistHours: 40, hltbId: 2, matchedName: 'Charlie' },
})

describe('sortRows', () => {
  it('returns the input array as-is when sortColumns is empty', () => {
    const rows = [rowA, rowB, rowC]
    expect(sortRows(rows, [])).toBe(rows)
  })

  it('sorts strings ascending using locale-aware compare', () => {
    const out = sortRows([rowC, rowA, rowB], [{ columnKey: 'name', direction: 'ASC' }])
    expect(out.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('sorts strings descending', () => {
    const out = sortRows([rowA, rowB, rowC], [{ columnKey: 'name', direction: 'DESC' }])
    expect(out.map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })

  it('sorts numbers ascending', () => {
    const out = sortRows([rowA, rowB, rowC], [{ columnKey: 'steamHours', direction: 'ASC' }])
    expect(out.map((r) => r.playtimeMinutes)).toEqual([60, 120, 180])
  })

  it('places missing HLTB values last regardless of direction (ASC)', () => {
    const out = sortRows([rowA, rowB, rowC], [{ columnKey: 'hltbMain', direction: 'ASC' }])
    expect(out.map((r) => r.name)).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })

  it('places missing HLTB values last regardless of direction (DESC)', () => {
    const out = sortRows([rowA, rowB, rowC], [{ columnKey: 'hltbMain', direction: 'DESC' }])
    expect(out.map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })

  it('does not mutate the input array', () => {
    const rows = [rowC, rowA, rowB]
    const snapshot = [...rows]
    sortRows(rows, [{ columnKey: 'name', direction: 'ASC' }])
    expect(rows).toEqual(snapshot)
  })

  it('ignores unknown columnKey and returns input as-is', () => {
    const rows = [rowC, rowA]
    const out = sortRows(rows, [{ columnKey: 'unknown' as 'name', direction: 'ASC' }])
    expect(out).toBe(rows)
  })
})
