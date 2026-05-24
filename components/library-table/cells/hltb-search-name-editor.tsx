'use client'

import { useRef } from 'react'
import type { RenderEditCellProps } from 'react-data-grid'
import { getHltbSearchName } from '@/lib/hltb/meta'
import type { GameRow } from '@/types/game'

type Props = Partial<RenderEditCellProps<GameRow>> & {
  row: GameRow
  onClose: (commitChanges?: boolean, shouldFocusCell?: boolean) => void
  onCommit: (row: GameRow, value: string) => void
}

export function HltbSearchNameEditor({ onClose, onCommit, row }: Props) {
  const committedRef = useRef(false)
  const initial = row.hltbMeta ? getHltbSearchName(row.hltbMeta) : row.name

  const commit = (value: string) => {
    if (committedRef.current) return
    committedRef.current = true
    onCommit(row, value)
    onClose(true)
  }

  return (
    <input
      autoFocus
      defaultValue={initial}
      className="h-full w-full bg-background px-2 text-sm outline-none"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit(event.currentTarget.value)
        } else if (event.key === 'Escape') {
          onClose(false)
        }
      }}
      onBlur={(event) => {
        if (committedRef.current) return
        commit(event.currentTarget.value)
      }}
    />
  )
}
