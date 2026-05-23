export const SORTABLE_KEYS = [
  'name',
  'steamHours',
  'hltbMain',
  'hltbMainExtra',
  'hltbCompletionist',
] as const

export type LibrarySortKey = (typeof SORTABLE_KEYS)[number]

export type LibrarySortColumn = {
  columnKey: LibrarySortKey
  direction: 'ASC' | 'DESC'
}

export const DEFAULT_SORT_COLUMNS: LibrarySortColumn[] = [
  { columnKey: 'name', direction: 'ASC' },
]

export const SORT_STORAGE_KEY = 'hltb-steam:library-sorting'
