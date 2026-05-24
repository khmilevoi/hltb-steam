import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HltbSearchNameCell } from '@/components/library-table/cells/hltb-search-name-cell'
import { HltbSearchNameEditor } from '@/components/library-table/cells/hltb-search-name-editor'
import { getHltbSearchName } from '@/lib/hltb/meta'
import type { GameRow, HltbMeta } from '@/types/game'

const steamMeta: HltbMeta = { source: 'steam-name', steamName: 'Portal', overrideName: null }
const overrideMeta: HltbMeta = {
  source: 'override-name',
  steamName: 'Portal',
  overrideName: 'Portal 2007',
}
const importMeta: HltbMeta = {
  source: 'steam-import',
  steamName: 'Portal',
  overrideName: null,
}

const row: GameRow = {
  appid: 1,
  name: 'Portal',
  playtimeMinutes: 60,
  headerImageUrl: 'portal.jpg',
  hltb: null,
  hltbMeta: overrideMeta,
}

describe('HLTB search name cells', () => {
  it('selects override when present and Steam name otherwise', () => {
    expect(getHltbSearchName(overrideMeta)).toBe('Portal 2007')
    expect(getHltbSearchName(steamMeta)).toBe('Portal')
  })

  it('shows placeholder when metadata is missing', () => {
    render(<HltbSearchNameCell meta={null} matchedName={null} />)
    expect(screen.getByText('--')).toBeTruthy()
  })

  it('hides reset for direct mapped rows and shows matched name', () => {
    render(<HltbSearchNameCell meta={importMeta} matchedName="Portal HLTB" onReset={vi.fn()} />)
    expect(screen.getByText('Portal HLTB')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reset HLTB search name' })).toBeNull()
  })

  it('shows reset only for fallback rows with an override', () => {
    render(<HltbSearchNameCell meta={overrideMeta} matchedName={null} onReset={vi.fn()} />)
    expect(screen.getByText('Portal 2007')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset HLTB search name' })).toBeTruthy()
  })

  it('commits once on Enter and closes', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()

    render(
      <HltbSearchNameEditor
        row={row}
        onCommit={onCommit}
        onClose={onClose}
      />,
    )

    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Portal 2007 updated' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(row, 'Portal 2007 updated')
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('cancels on Escape without committing', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()

    render(<HltbSearchNameEditor row={row} onCommit={onCommit} onClose={onClose} />)

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    expect(onCommit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledWith(false)
  })
})
