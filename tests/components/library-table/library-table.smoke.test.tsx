import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibraryTable } from '@/components/library-table'

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
