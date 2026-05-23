'use client'

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { GameRow } from '@/types/game'

function hours(minutes: number) {
  return (minutes / 60).toFixed(1)
}

function HltbCell({
  value,
  isLoading,
  rowHasHltb,
}: {
  value: number | null
  isLoading: boolean
  rowHasHltb: boolean
}) {
  if (isLoading && !rowHasHltb) return <Skeleton className="h-4 w-10" />
  if (value === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground cursor-help">--</span>
        </TooltipTrigger>
        <TooltipContent>HLTB data unavailable</TooltipContent>
      </Tooltip>
    )
  }
  return `${value}h`
}

function SortIcon({ state }: { state: false | 'asc' | 'desc' }) {
  if (state === 'asc') return <ArrowUp aria-hidden="true" className="ml-1 inline" />
  if (state === 'desc') return <ArrowDown aria-hidden="true" className="ml-1 inline" />
  return <ArrowUpDown aria-hidden="true" className="ml-1 inline opacity-40" />
}

function buildColumns(hltbLoading: boolean): ColumnDef<GameRow>[] {
  return [
    {
      id: 'cover',
      header: '',
      cell: ({ row }) => (
        <Image
          src={row.original.headerImageUrl}
          alt={row.original.name}
          width={92}
          height={43}
          className="rounded"
          unoptimized
        />
      ),
      enableSorting: false,
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'steamHours',
      header: 'Steam played',
      accessorFn: (row) => row.playtimeMinutes,
      cell: ({ row }) => `${hours(row.original.playtimeMinutes)}h`,
    },
    {
      id: 'hltbMain',
      header: 'HLTB Main',
      accessorFn: (row) => row.hltb?.mainHours ?? undefined,
      cell: ({ row }) => (
        <HltbCell
          value={row.original.hltb?.mainHours ?? null}
          isLoading={hltbLoading}
          rowHasHltb={row.original.hltb !== null}
        />
      ),
      sortUndefined: 'last',
    },
    {
      id: 'hltbMainExtra',
      header: 'HLTB +Extra',
      accessorFn: (row) => row.hltb?.mainExtraHours ?? undefined,
      cell: ({ row }) => (
        <HltbCell
          value={row.original.hltb?.mainExtraHours ?? null}
          isLoading={hltbLoading}
          rowHasHltb={row.original.hltb !== null}
        />
      ),
      sortUndefined: 'last',
    },
    {
      id: 'hltbCompletionist',
      header: 'HLTB 100%',
      accessorFn: (row) => row.hltb?.completionistHours ?? undefined,
      cell: ({ row }) => (
        <HltbCell
          value={row.original.hltb?.completionistHours ?? null}
          isLoading={hltbLoading}
          rowHasHltb={row.original.hltb !== null}
        />
      ),
      sortUndefined: 'last',
    },
  ]
}

export function LibraryTable({ rows, hltbLoading }: { rows: GameRow[]; hltbLoading: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const columns = useMemo(() => buildColumns(hltbLoading), [hltbLoading])
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      className={canSort ? 'cursor-pointer select-none whitespace-nowrap' : undefined}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort ? <SortIcon state={sorted} /> : null}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No games match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}
