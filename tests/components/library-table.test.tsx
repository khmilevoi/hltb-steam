import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibraryTable } from '@/components/library-table'
import type { GameRow } from '@/types/game'

function gameRow(overrides: Partial<GameRow> = {}): GameRow {
  return {
    appid: 1,
    name: 'Broken Cover Game',
    playtimeMinutes: 60,
    headerImageUrl: 'https://cdn.example.invalid/missing.jpg',
    hltb: null,
    ...overrides,
  }
}

describe('LibraryTable', () => {
  it('uses a local placeholder when a cover image fails to load', () => {
    render(<LibraryTable rows={[gameRow()]} hltbLoading={false} />)

    const cover = screen.getByRole('img', { name: 'Broken Cover Game' })
    fireEvent.error(cover)

    expect(cover.getAttribute('src')).toBe('/game-placeholder.svg')
  })
})
