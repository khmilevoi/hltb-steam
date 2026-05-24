import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryScreen } from '@/app/library/library-screen'
import type { GameRow, HltbEntry, HltbMeta, SteamGame } from '@/types/game'

type LibraryTableProps = {
  rows: readonly GameRow[]
  hltbLoading: boolean
  onHltbSearchNameCommit?: (row: GameRow, searchName: string | null) => Promise<void> | void
}

type RefreshControlsProps = {
  libraryCachedAt: string | null
  hltbCachedAtMap: Record<number, string | null>
  onRefreshLibrary: () => Promise<void> | void
  onRefreshHltb: () => Promise<void> | void
}

const libraryTableProps: LibraryTableProps[] = []
const refreshControlsProps: RefreshControlsProps[] = []

const saveHltbOverrideAndRefreshMock = vi.fn<
  (args: { appid: number; queryClient: unknown; searchName: string | null }) => Promise<void>
>()
const refreshLibraryMock = vi.fn<(client: unknown) => Promise<SteamGame[]>>()
const refreshHltbMock = vi.fn<(client: unknown) => Promise<void>>()
const invalidateQueriesMock = vi.fn()
const toastErrorMock = vi.fn()

const queryClient = { invalidateQueries: invalidateQueriesMock } as const

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClient,
}))

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

vi.mock('@/components/auth-button', () => ({
  AuthButton: () => <button type="button">Sign out</button>,
}))

vi.mock('@/components/library-filters', () => ({
  LibraryFilters: () => null,
}))

vi.mock('@/components/refresh-controls', () => ({
  RefreshControls: (props: RefreshControlsProps) => {
    refreshControlsProps.push(props)
    return (
      <div>
        <button type="button" data-testid="refresh-library" onClick={() => void props.onRefreshLibrary()}>
          refresh library
        </button>
        <button type="button" data-testid="refresh-hltb" onClick={() => void props.onRefreshHltb()}>
          refresh hltb
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/library-table', () => ({
  LibraryTable: (props: LibraryTableProps) => {
    libraryTableProps.push(props)
    return <div data-testid="library-table" />
  },
}))

const games: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 0, headerImageUrl: 'portal.jpg' },
  { appid: 2, name: 'Hades', playtimeMinutes: 0, headerImageUrl: 'hades.jpg' },
]

const entries: Record<number, HltbEntry | null> = {
  1: { mainHours: 3, mainExtraHours: 5, completionistHours: 8, hltbId: 10, matchedName: 'Portal' },
}

const meta: Record<number, HltbMeta> = {
  1: { source: 'steam-name', steamName: 'Portal', overrideName: null },
}

vi.mock('@/hooks/use-library', () => ({
  refreshLibrary: (...args: unknown[]) => refreshLibraryMock(...(args as [unknown])),
  useLibrary: () => ({
    data: { games, cachedAt: '2026-05-23T00:00:00.000Z' },
    error: null,
    isError: false,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-hltb', () => ({
  HLTB_QUERY_KEY: ['hltb'],
  refreshHltb: (...args: unknown[]) => refreshHltbMock(...(args as [unknown])),
  saveHltbOverrideAndRefresh: (
    args: { appid: number; queryClient: unknown; searchName: string | null },
  ) => saveHltbOverrideAndRefreshMock(args),
  useHltb: () => ({
    data: { entries, cachedAt: {}, meta },
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

beforeEach(() => {
  saveHltbOverrideAndRefreshMock.mockReset()
  saveHltbOverrideAndRefreshMock.mockResolvedValue()
  refreshLibraryMock.mockReset()
  refreshLibraryMock.mockResolvedValue(games)
  refreshHltbMock.mockReset()
  refreshHltbMock.mockResolvedValue()
  invalidateQueriesMock.mockReset()
  invalidateQueriesMock.mockResolvedValue(undefined)
  toastErrorMock.mockReset()
  libraryTableProps.length = 0
  refreshControlsProps.length = 0
})

afterEach(() => {
  localStorage.clear()
})

function buildRow(overrides: Partial<GameRow> = {}): GameRow {
  return {
    appid: 1,
    name: 'Portal',
    playtimeMinutes: 0,
    headerImageUrl: 'portal.jpg',
    hltb: null,
    hltbMeta: { source: 'steam-name', steamName: 'Portal', overrideName: null },
    ...overrides,
  }
}

function latestCommitHandler() {
  const handler = libraryTableProps.at(-1)?.onHltbSearchNameCommit
  if (!handler) throw new Error('expected onHltbSearchNameCommit prop')
  return handler
}

describe('LibraryScreen save handler', () => {
  it('forwards trimmed search name when commit differs from Steam name', async () => {
    render(<LibraryScreen />)
    const onCommit = latestCommitHandler()

    await onCommit(buildRow(), '  Portal 2007  ')

    expect(saveHltbOverrideAndRefreshMock).toHaveBeenCalledTimes(1)
    expect(saveHltbOverrideAndRefreshMock).toHaveBeenCalledWith({
      appid: 1,
      queryClient,
      searchName: 'Portal 2007',
    })
  })

  it('sends null when commit value matches Steam name', async () => {
    render(<LibraryScreen />)
    const onCommit = latestCommitHandler()

    await onCommit(buildRow(), 'Portal')

    expect(saveHltbOverrideAndRefreshMock).toHaveBeenCalledWith({
      appid: 1,
      queryClient,
      searchName: null,
    })
  })

  it('sends null when commit value is blank', async () => {
    render(<LibraryScreen />)
    const onCommit = latestCommitHandler()

    await onCommit(buildRow(), '   ')

    expect(saveHltbOverrideAndRefreshMock).toHaveBeenCalledWith({
      appid: 1,
      queryClient,
      searchName: null,
    })
  })

  it('sends null when reset fires with null', async () => {
    render(<LibraryScreen />)
    const onCommit = latestCommitHandler()

    await onCommit(buildRow(), null)

    expect(saveHltbOverrideAndRefreshMock).toHaveBeenCalledWith({
      appid: 1,
      queryClient,
      searchName: null,
    })
  })

  it('shows toast and keeps screen mounted on save failure', async () => {
    saveHltbOverrideAndRefreshMock.mockRejectedValueOnce(new Error('boom'))
    render(<LibraryScreen />)
    const onCommit = latestCommitHandler()

    await onCommit(buildRow(), 'Portal 2007')

    expect(toastErrorMock).toHaveBeenCalledWith('HLTB override update failed: boom')
  })
})

describe('LibraryScreen refresh flow', () => {
  it('refreshes the library and invalidates the HLTB query', async () => {
    render(<LibraryScreen />)

    fireEvent.click(document.querySelector('[data-testid="refresh-library"]') as HTMLElement)

    await waitFor(() => {
      expect(refreshLibraryMock).toHaveBeenCalledWith(queryClient)
      expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['hltb'] })
    })
  })

  it('toasts when library refresh throws', async () => {
    refreshLibraryMock.mockRejectedValueOnce(new Error('offline'))
    render(<LibraryScreen />)

    fireEvent.click(document.querySelector('[data-testid="refresh-library"]') as HTMLElement)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Refresh library failed: offline')
    })
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })
})
