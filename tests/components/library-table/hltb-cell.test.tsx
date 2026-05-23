import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HltbCell } from '@/components/library-table/cells/hltb-cell'
import { TooltipProvider } from '@/components/ui/tooltip'

function renderHltbCell(props: { value: number | null; isLoading: boolean; rowHasHltb: boolean }) {
  return render(
    <TooltipProvider>
      <HltbCell {...props} />
    </TooltipProvider>,
  )
}

describe('HltbCell', () => {
  it('renders nothing visible when loading and the row has no HLTB yet (skeleton branch)', () => {
    const { container } = renderHltbCell({ value: null, isLoading: true, rowHasHltb: false })
    expect(container.textContent).toBe('')
  })

  it('renders a dashed placeholder when the value is null and not loading', () => {
    renderHltbCell({ value: null, isLoading: false, rowHasHltb: true })
    expect(screen.getByText('--')).toBeTruthy()
  })

  it('renders the hours suffix when the value is a number', () => {
    renderHltbCell({ value: 42, isLoading: false, rowHasHltb: true })
    expect(screen.getByText('42h')).toBeTruthy()
  })

  it('renders sub-hour values in minutes', () => {
    renderHltbCell({ value: 0.25, isLoading: false, rowHasHltb: true })
    expect(screen.getByText('15m')).toBeTruthy()
  })

  it('still renders the value when loading but the row already has HLTB data', () => {
    renderHltbCell({ value: 12, isLoading: true, rowHasHltb: true })
    expect(screen.getByText('12h')).toBeTruthy()
  })
})
