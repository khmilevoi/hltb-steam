import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LibraryScreen } from '@/app/library/library-screen'
import type { HltbEntry, SteamGame } from '@/types/game'

const filtersStorageKey = 'hltb-steam:library-filters'
const sortingStorageKey = 'hltb-steam:library-sorting'

function visibleGameNames() {
  return Array.from(document.querySelectorAll('tbody tr')).map(
    (row) => row.querySelectorAll('td')[1]?.textContent,
  )
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@/components/auth-button', () => ({
  AuthButton: () => <button type="button">Sign out</button>,
}))

vi.mock('@/components/refresh-controls', () => ({
  RefreshControls: () => null,
}))

const games: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 120, headerImageUrl: 'portal.jpg' },
  { appid: 2, name: 'Hades', playtimeMinutes: 300, headerImageUrl: 'hades.jpg' },
]

const entries: Record<number, HltbEntry | null> = {
  1: { mainHours: 3, mainExtraHours: 5, completionistHours: 8, hltbId: 10, matchedName: 'Portal' },
  2: { mainHours: 20, mainExtraHours: 30, completionistHours: 50, hltbId: 20, matchedName: 'Hades' },
}

vi.mock('@/hooks/use-library', () => ({
  refreshLibrary: vi.fn(),
  useLibrary: () => ({
    data: { games, cachedAt: '2026-05-23T00:00:00.000Z' },
    error: null,
    isError: false,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-hltb', () => ({
  refreshHltb: vi.fn(),
  useHltb: () => ({
    data: { entries, cachedAt: {} },
    error: null,
    isError: false,
    isFetching: false,
  }),
}))

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  localStorage.clear()
})

describe('LibraryScreen filter persistence', () => {
  it('restores filters from localStorage', async () => {
    localStorage.setItem(filtersStorageKey, JSON.stringify({ query: 'Portal', hltbRange: [1, 5] }))

    render(<LibraryScreen />)

    await waitFor(() =>
      expect((screen.getByPlaceholderText('Filter by name...') as HTMLInputElement).value).toBe(
        'Portal',
      ),
    )
    expect(screen.getByText('HLTB Main: 1h - 5h')).toBeTruthy()
    expect(screen.getByText('Portal')).toBeTruthy()
    expect(screen.queryByText('Hades')).toBeNull()
  })

  it('saves changed filters to localStorage', () => {
    render(<LibraryScreen />)

    fireEvent.change(screen.getByPlaceholderText('Filter by name...'), {
      target: { value: 'Hades' },
    })

    expect(JSON.parse(localStorage.getItem(filtersStorageKey) ?? '{}')).toMatchObject({
      query: 'Hades',
      hltbRange: [0, 9999],
    })
  })
})

describe('LibraryScreen sorting persistence', () => {
  it('restores sorting from localStorage', async () => {
    localStorage.setItem(sortingStorageKey, JSON.stringify([{ id: 'steamHours', desc: false }]))

    render(<LibraryScreen />)

    await waitFor(() => expect(visibleGameNames()[0]).toBe('Portal'))
  })

  it('saves changed sorting to localStorage', async () => {
    render(<LibraryScreen />)

    fireEvent.click(screen.getByText('Steam played'))

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(sortingStorageKey) ?? '[]')[0]).toMatchObject({
        id: 'steamHours',
      })
    })
  })
})
