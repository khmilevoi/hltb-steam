'use client'

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
      <div className="h-[calc(100vh-280px)] min-h-[320px] overflow-hidden rounded-md border">
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
            noRowsFallback: (
              <div className="flex h-24 items-center justify-center text-sm">
                No games match the current filters.
              </div>
            ),
          }}
        />
      </div>
    </TooltipProvider>
  )
}
