import { useMemo } from 'react'
import type { Column, RenderHeaderCellProps } from 'react-data-grid'
import type { GameRow } from '@/types/game'
import { GameCoverCell } from './cells/game-cover-cell'
import { HltbCell } from './cells/hltb-cell'
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

export function useLibraryColumns(hltbLoading: boolean): readonly Column<GameRow>[] {
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
        sortable: true,
        renderHeaderCell: renderHeaderCell('Name'),
        renderCell: ({ row }) => <span className="font-medium">{row.name}</span>,
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
    [hltbLoading],
  )
}
