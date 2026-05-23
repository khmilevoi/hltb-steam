import { useMemo } from 'react'
import type { SortColumn } from 'react-data-grid'
import type { GameRow } from '@/types/game'
import { SORTABLE_KEYS, type LibrarySortKey } from './types'

type Accessor = (row: GameRow) => string | number | null | undefined

const accessors: Record<LibrarySortKey, Accessor> = {
  name: (r) => r.name,
  steamHours: (r) => r.playtimeMinutes,
  hltbMain: (r) => r.hltb?.mainHours ?? undefined,
  hltbMainExtra: (r) => r.hltb?.mainExtraHours ?? undefined,
  hltbCompletionist: (r) => r.hltb?.completionistHours ?? undefined,
}

function isSortable(key: string): key is LibrarySortKey {
  return (SORTABLE_KEYS as readonly string[]).includes(key)
}

function isMissing(v: unknown): v is null | undefined {
  return v === null || v === undefined
}

function compare(
  a: GameRow,
  b: GameRow,
  accessor: Accessor,
  direction: 'ASC' | 'DESC',
): number {
  const va = accessor(a)
  const vb = accessor(b)
  if (isMissing(va) && isMissing(vb)) return 0
  if (isMissing(va)) return 1
  if (isMissing(vb)) return -1
  const cmp =
    typeof va === 'string' && typeof vb === 'string'
      ? va.localeCompare(vb)
      : (va as number) - (vb as number)
  return direction === 'DESC' ? -cmp : cmp
}

export function sortRows(
  rows: readonly GameRow[],
  sortColumns: readonly SortColumn[],
): readonly GameRow[] {
  if (sortColumns.length === 0) return rows
  const first = sortColumns[0]
  if (!isSortable(first.columnKey)) return rows
  const accessor = accessors[first.columnKey]
  return [...rows].sort((a, b) => compare(a, b, accessor, first.direction))
}

export function useSortedRows(
  rows: readonly GameRow[],
  sortColumns: readonly SortColumn[],
): readonly GameRow[] {
  return useMemo(() => sortRows(rows, sortColumns), [rows, sortColumns])
}
