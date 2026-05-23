import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  DEFAULT_SORT_COLUMNS,
  SORTABLE_KEYS,
  SORT_STORAGE_KEY,
  type LibrarySortColumn,
} from './types'

const sortColumnSchema = z.object({
  columnKey: z.enum(SORTABLE_KEYS),
  direction: z.enum(['ASC', 'DESC']),
})
const sortColumnsSchema = z.array(sortColumnSchema)

function readStored(): LibrarySortColumn[] {
  if (typeof window === 'undefined') return DEFAULT_SORT_COLUMNS
  let raw: string | null
  try {
    raw = window.localStorage.getItem(SORT_STORAGE_KEY)
  } catch {
    return DEFAULT_SORT_COLUMNS
  }
  if (!raw) return DEFAULT_SORT_COLUMNS
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_SORT_COLUMNS
  }
  const result = sortColumnsSchema.safeParse(parsed)
  return result.success ? (result.data as LibrarySortColumn[]) : DEFAULT_SORT_COLUMNS
}

export function usePersistedSortColumns(): readonly [
  LibrarySortColumn[],
  (next: LibrarySortColumn[]) => void,
] {
  const [sortColumns, setSortColumns] = useState<LibrarySortColumn[]>(readStored)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sortColumns))
    } catch {
      // localStorage may be unavailable; sorting still works in-memory.
    }
  }, [sortColumns])

  return [sortColumns, setSortColumns] as const
}
