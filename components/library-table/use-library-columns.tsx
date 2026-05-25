import { useMemo } from 'react'
import type { Column, DataGridHandle, RenderHeaderCellProps } from 'react-data-grid'
import type { GameRow } from '@/types/game'
import { GameCoverCell } from './cells/game-cover-cell'
import { HltbCell } from './cells/hltb-cell'
import { HltbSearchNameCell } from './cells/hltb-search-name-cell'
import { HltbSearchNameEditor } from './cells/hltb-search-name-editor'
import { SortIcon } from './sort-icon'

function hours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

function renderHeaderCell(name: string) {
  return function HeaderCell({ column, sortDirection }: RenderHeaderCellProps<GameRow>) {
    return (
      <span className="flex items-center whitespace-nowrap">
        {name}
        {column.sortable ? <SortIcon direction={sortDirection} /> : null}
      </span>
    )
  }
}

export function useLibraryColumns(
  hltbLoading: boolean,
  gridRef: React.RefObject<DataGridHandle | null>,
  savingAppids?: ReadonlySet<number>,
  onHltbSearchNameCommit?: (row: GameRow, searchName: string | null) => void | Promise<void>,
): readonly Column<GameRow>[] {
  return useMemo<Column<GameRow>[]>(
    () => [
      {
        key: 'cover',
        name: '',
        width: 100,
        sortable: false,
        renderCell: ({ row }) => <GameCoverCell src={row.headerImageUrl} name={row.name} />,
      },
      {
        key: 'name',
        name: 'Name',
        sortable: false,
        width: 220,
        editable: (row) => row.hltbMeta?.source !== 'steam-import',
        renderHeaderCell: renderHeaderCell('Name'),
        renderCell: ({ row, column, rowIdx }) => (
          <HltbSearchNameCell
            meta={row.hltbMeta}
            matchedName={row.hltb?.matchedName ?? row.name}
            isSaving={savingAppids?.has(row.appid) ?? false}
            onReset={() => onHltbSearchNameCommit?.(row, null)}
            onEdit={
              row.hltbMeta?.source !== 'steam-import'
                ? () => gridRef.current?.selectCell({ idx: column.idx, rowIdx }, { enableEditor: true })
                : undefined
            }
          />
        ),
        renderEditCell: (props) => (
          <HltbSearchNameEditor
            {...props}
            onCommit={(row, value) => onHltbSearchNameCommit?.(row, value)}
          />
        ),
      },
      {
        key: 'steamHours',
        name: 'Steam played',
        sortable: true,
        renderHeaderCell: renderHeaderCell('Steam played'),
        renderCell: ({ row }) => `${hours(row.playtimeMinutes)}h`,
      },
      {
        key: 'hltbMain',
        name: 'HLTB Main',
        sortable: true,
        renderHeaderCell: renderHeaderCell('HLTB Main'),
        renderCell: ({ row }) => (
          <HltbCell
            value={row.hltb?.mainHours ?? null}
            isLoading={hltbLoading}
            rowHasHltb={row.hltb !== null}
          />
        ),
      },
      {
        key: 'hltbMainExtra',
        name: 'HLTB +Extra',
        sortable: true,
        renderHeaderCell: renderHeaderCell('HLTB +Extra'),
        renderCell: ({ row }) => (
          <HltbCell
            value={row.hltb?.mainExtraHours ?? null}
            isLoading={hltbLoading}
            rowHasHltb={row.hltb !== null}
          />
        ),
      },
      {
        key: 'hltbCompletionist',
        name: 'HLTB 100%',
        sortable: true,
        renderHeaderCell: renderHeaderCell('HLTB 100%'),
        renderCell: ({ row }) => (
          <HltbCell
            value={row.hltb?.completionistHours ?? null}
            isLoading={hltbLoading}
            rowHasHltb={row.hltb !== null}
          />
        ),
      },
    ],
    [hltbLoading, gridRef, savingAppids, onHltbSearchNameCommit],
  )
}
