import { render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibraryTable } from '@/components/library-table'
import { useLibraryColumns } from '@/components/library-table/use-library-columns'
import type { GameRow } from '@/types/game'

describe('LibraryTable smoke', () => {
  it('mounts with empty rows and exposes a grid role', () => {
    render(<LibraryTable rows={[]} hltbLoading={false} />)
    expect(screen.getByRole('grid')).toBeTruthy()
  })

  it('renders a centered empty state outside the grid cells', () => {
    render(<LibraryTable rows={[]} hltbLoading={false} />)
    expect(screen.getByRole('status').textContent).toContain('No games match')
  })

})

describe('useLibraryColumns', () => {
  const baseRow: GameRow = {
    appid: 1,
    name: 'Portal',
    playtimeMinutes: 60,
    headerImageUrl: 'portal.jpg',
    hltb: null,
    hltbMeta: null,
  }

  it('makes direct mapped rows readonly and fallback rows editable', () => {
    const { result } = renderHook(() => useLibraryColumns(false, { current: null }))
    const columns = result.current
    const nameColumn = columns.find((column) => column.key === 'name')

    const editable = nameColumn?.editable
    expect(typeof editable).toBe('function')
    if (typeof editable !== 'function') return

    expect(editable({
      ...baseRow,
      hltbMeta: { source: 'steam-import', steamName: 'Portal', overrideName: null },
    })).toBe(false)
    expect(editable({
      ...baseRow,
      hltbMeta: { source: 'steam-name', steamName: 'Portal', overrideName: null },
    })).toBe(true)
  })

  it('exposes the HLTB-search editor on the name column', () => {
    const { result } = renderHook(() => useLibraryColumns(false, { current: null }))
    const nameColumn = result.current.find((column) => column.key === 'name')
    expect(typeof nameColumn?.renderEditCell).toBe('function')
  })
})
