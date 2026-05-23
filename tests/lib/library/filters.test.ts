import { describe, expect, it } from 'vitest'
import { filterByHltbRange, searchByName, sortBy } from '@/lib/library/filters'
import type { GameRow } from '@/types/game'

const rows: GameRow[] = [
  {
    appid: 1,
    name: 'Portal',
    playtimeMinutes: 600,
    headerImageUrl: 'x',
    hltb: {
      mainHours: 3,
      mainExtraHours: 5,
      completionistHours: 10,
      hltbId: 11,
      matchedName: 'Portal',
    },
  },
  {
    appid: 2,
    name: 'Witcher 3',
    playtimeMinutes: 6000,
    headerImageUrl: 'x',
    hltb: {
      mainHours: 52,
      mainExtraHours: 105,
      completionistHours: 180,
      hltbId: 22,
      matchedName: 'The Witcher 3',
    },
  },
  {
    appid: 3,
    name: 'Hades',
    playtimeMinutes: 0,
    headerImageUrl: 'x',
    hltb: null,
  },
]

describe('searchByName', () => {
  it('returns all rows for empty query', () => {
    expect(searchByName(rows, '')).toEqual(rows)
  })

  it('is case-insensitive substring match', () => {
    expect(searchByName(rows, 'PORT').map((r) => r.appid)).toEqual([1])
  })

  it('returns empty when no match', () => {
    expect(searchByName(rows, 'doom')).toEqual([])
  })
})

describe('sortBy', () => {
  it('sorts by name asc', () => {
    expect(sortBy(rows, 'name', 'asc').map((r) => r.appid)).toEqual([3, 1, 2])
  })

  it('sorts by name desc', () => {
    expect(sortBy(rows, 'name', 'desc').map((r) => r.appid)).toEqual([2, 1, 3])
  })

  it('sorts by steamHours desc', () => {
    expect(sortBy(rows, 'steamHours', 'desc').map((r) => r.appid)).toEqual([2, 1, 3])
  })

  it('sorts by hltbMain asc; null-hltb rows go to the end regardless of direction', () => {
    const asc = sortBy(rows, 'hltbMain', 'asc').map((r) => r.appid)
    const desc = sortBy(rows, 'hltbMain', 'desc').map((r) => r.appid)
    expect(asc).toEqual([1, 2, 3])
    expect(desc).toEqual([2, 1, 3])
  })

  it('sorts by hltbMainExtra asc', () => {
    expect(sortBy(rows, 'hltbMainExtra', 'asc').map((r) => r.appid)).toEqual([1, 2, 3])
  })

  it('sorts by hltbCompletionist desc', () => {
    expect(sortBy(rows, 'hltbCompletionist', 'desc').map((r) => r.appid)).toEqual([2, 1, 3])
  })

  it('returns empty for empty input', () => {
    expect(sortBy([], 'name', 'asc')).toEqual([])
  })
})

describe('filterByHltbRange', () => {
  it('includes rows whose mainHours is within [min, max]', () => {
    expect(filterByHltbRange(rows, 1, 10).map((r) => r.appid)).toEqual([1])
  })

  it('excludes rows with null hltb', () => {
    expect(filterByHltbRange(rows, 0, 999).map((r) => r.appid)).toEqual([1, 2])
  })

  it('excludes rows with null mainHours', () => {
    const r: GameRow = { ...rows[0], hltb: { ...rows[0].hltb!, mainHours: null } }
    expect(filterByHltbRange([r], 0, 100)).toEqual([])
  })

  it('returns all when min=0 and max=Infinity (still excludes nulls)', () => {
    expect(filterByHltbRange(rows, 0, Number.POSITIVE_INFINITY).length).toBe(2)
  })
})
