'use client'

import { SearchX } from 'lucide-react'
import { DataGrid, type SortColumn } from 'react-data-grid'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GameRow } from '@/types/game'
import { useLibraryColumns } from './use-library-columns'
import { usePersistedSortColumns } from './use-persisted-sort-columns'
import { useSortedRows } from './use-sorted-rows'

type Props = {
  rows: readonly GameRow[]
  hltbLoading: boolean
}

export function LibraryTable({ rows, hltbLoading }: Props) {
  const columns = useLibraryColumns(hltbLoading)
  const [sortColumns, setSortColumns] = usePersistedSortColumns()
  const sortedRows = useSortedRows(rows, sortColumns)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative h-[calc(100vh-280px)] min-h-[320px] overflow-hidden rounded-md border">
        <DataGrid
          className="rdg-light"
          columns={columns}
          rows={sortedRows}
          rowKeyGetter={(row) => row.appid}
          sortColumns={sortColumns as SortColumn[]}
          onSortColumnsChange={(next) => setSortColumns(next as typeof sortColumns)}
          rowHeight={56}
          headerRowHeight={40}
          defaultColumnOptions={{ sortable: true, resizable: false }}
          renderers={{
            noRowsFallback: null,
          }}
        />
        {sortedRows.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-x-0 top-10 bottom-0 flex items-center justify-center px-6"
          >
            <div className="grid max-w-sm place-items-center gap-2 text-center">
              <SearchX className="text-muted-foreground/70 size-8" aria-hidden="true" />
              <p className="text-sm font-medium">No games match the current filters.</p>
              <p className="text-muted-foreground text-xs">
                Try another search or adjust the HLTB range.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
