import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameCoverCell } from '@/components/library-table/cells/game-cover-cell'

describe('GameCoverCell', () => {
  it('falls back to the local placeholder when the remote image fails', () => {
    render(<GameCoverCell src="https://cdn.example.invalid/missing.jpg" name="Broken" />)
    const img = screen.getByRole('img', { name: 'Broken' })
    fireEvent.error(img)
    expect(img.getAttribute('src')).toBe('/game-placeholder.svg')
  })

  it('uses the placeholder immediately when src is an empty string', () => {
    render(<GameCoverCell src="" name="Empty" />)
    expect(screen.getByRole('img', { name: 'Empty' }).getAttribute('src')).toBe(
      '/game-placeholder.svg',
    )
  })
})
