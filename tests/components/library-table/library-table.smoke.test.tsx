import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibraryTable } from '@/components/library-table'

describe('LibraryTable smoke', () => {
  it('mounts with empty rows and exposes a grid role', () => {
    render(<LibraryTable rows={[]} hltbLoading={false} />)
    expect(screen.getByRole('grid')).toBeTruthy()
  })
})
