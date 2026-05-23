import type { GameRow, SortDirection, SortField } from '@/types/game'

export function searchByName(rows: GameRow[], query: string): GameRow[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return rows
  return rows.filter((row) => row.name.toLowerCase().includes(q))
}

function fieldValue(row: GameRow, field: SortField): number | string | null {
  if (field === 'name') return row.name.toLowerCase()
  if (field === 'steamHours') return row.playtimeMinutes
  const hltb = row.hltb
  if (hltb === null) return null
  if (field === 'hltbMain') return hltb.mainHours
  if (field === 'hltbMainExtra') return hltb.mainExtraHours
  return hltb.completionistHours
}

export function sortBy(
  rows: GameRow[],
  field: SortField,
  direction: SortDirection,
): GameRow[] {
  const copy = [...rows]
  const dir = direction === 'asc' ? 1 : -1
  copy.sort((a, b) => {
    const va = fieldValue(a, field)
    const vb = fieldValue(b, field)
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    if (typeof va === 'string' && typeof vb === 'string') {
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0
    }
    return ((va as number) - (vb as number)) * dir
  })
  return copy
}

export function filterByHltbRange(
  rows: GameRow[],
  minHours: number,
  maxHours: number,
): GameRow[] {
  return rows.filter((row) => {
    if (row.hltb === null) return false
    const main = row.hltb.mainHours
    if (main === null) return false
    return main >= minHours && main <= maxHours
  })
}
