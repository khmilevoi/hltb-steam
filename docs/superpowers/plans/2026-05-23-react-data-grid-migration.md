# react-data-grid Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@tanstack/react-table` with `react-data-grid` (Comcast/v7) in `components/library-table.tsx`, virtualizing rows of the Steam library while keeping the shadcn look 1:1. Sort state and its persistence move out of `LibraryScreen` and become internal to a new `components/library-table/` module split into atomic hooks and cell components.

**Architecture:** Single client module `components/library-table/` exposes one `LibraryTable` component (barrel via `index.ts`). It owns sort state via `usePersistedSortColumns` (lazy localStorage load + `zod`-validated save), pure `useSortedRows` runs the comparator (with `null/undefined` always last), and `useLibraryColumns` returns a memoized `Column<GameRow>[]`. The grid uses `react-data-grid`'s built-in virtualization with a fixed viewport-bound height; theming is achieved by mapping `--rdg-*` CSS custom properties to existing shadcn `oklch` design tokens.

**Tech Stack:** `react-data-grid@7.0.0-beta.59`, React 19.2.4, Next.js 16, TypeScript, Tailwind 4 (shadcn theming with `oklch` tokens), `zod` v4, Vitest + jsdom + `@testing-library/react`, `lucide-react` icons, `pnpm`.

**Reference spec:** [`docs/superpowers/specs/2026-05-23-react-data-grid-migration-design.md`](../specs/2026-05-23-react-data-grid-migration-design.md)

**Heads-up about pre-existing staged changes:** at the start of this branch `next.config.ts`, `package.json`, `pnpm-lock.yaml`, and one line of `components/library-table.tsx` were staged and got bundled into commit `0cba380` together with the spec. Plan assumes that's accepted as-is; if not, fix outside this plan first.

---

## Task 1: Install react-data-grid

**Files:**
- Modify: `package.json` (dependency added)
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Add the dependency pinned to the exact version**

Run from repo root:

```bash
pnpm add react-data-grid@7.0.0-beta.59 --save-exact
```

Expected: `package.json` gets `"react-data-grid": "7.0.0-beta.59"` (no `^`), `pnpm-lock.yaml` updates.

- [ ] **Step 2: Verify peer dependency satisfaction**

Check that `react` in `package.json` is `19.2.4` (already true). RDG requires `react: ^19.2`. If pnpm prints a peer-dependency warning about React, stop and report — do not proceed.

- [ ] **Step 3: Verify the build still succeeds**

```bash
pnpm run build
```

Expected: build completes without errors. The new package is installed but not imported yet, so build output is unchanged.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-data-grid 7.0.0-beta.59"
```

---

## Task 2: Add ResizeObserver shim to test setup

`react-data-grid` calls `ResizeObserver` during mount. jsdom does not implement it. We add a no-op shim so any future test that mounts `<DataGrid>` (Task 10 smoke test) doesn't crash. This change is harmless for existing tests.

**Files:**
- Modify: `tests/setup.ts`

- [ ] **Step 1: Append the ResizeObserver shim**

Open `tests/setup.ts` and append:

```ts
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
```

The file now contains the existing env-var lines plus this shim.

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

```bash
pnpm test
```

Expected: existing tests pass exactly as before.

- [ ] **Step 3: Commit**

```bash
git add tests/setup.ts
git commit -m "test: shim ResizeObserver for jsdom"
```

---

## Task 3: Create module skeleton, shared types, and SortIcon

This task lays down the directory structure, the shared types/constants both hooks need, and the trivial `SortIcon` component. No tests — pure structural scaffolding.

**Files:**
- Create: `components/library-table/types.ts`
- Create: `components/library-table/sort-icon.tsx`
- Create: `components/library-table/index.ts` (temporary placeholder export, replaced in Task 10)

- [ ] **Step 1: Create `components/library-table/types.ts`**

```ts
export const SORTABLE_KEYS = [
  'name',
  'steamHours',
  'hltbMain',
  'hltbMainExtra',
  'hltbCompletionist',
] as const

export type LibrarySortKey = (typeof SORTABLE_KEYS)[number]

export type LibrarySortColumn = {
  columnKey: LibrarySortKey
  direction: 'ASC' | 'DESC'
}

export const DEFAULT_SORT_COLUMNS: LibrarySortColumn[] = [
  { columnKey: 'name', direction: 'ASC' },
]

export const SORT_STORAGE_KEY = 'hltb-steam:library-sorting'
```

- [ ] **Step 2: Create `components/library-table/sort-icon.tsx`**

```tsx
'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

type Props = { direction: 'ASC' | 'DESC' | undefined }

export function SortIcon({ direction }: Props) {
  if (direction === 'ASC') return <ArrowUp aria-hidden="true" className="ml-1 inline" />
  if (direction === 'DESC') return <ArrowDown aria-hidden="true" className="ml-1 inline" />
  return <ArrowUpDown aria-hidden="true" className="ml-1 inline opacity-40" />
}
```

- [ ] **Step 3: Create temporary `components/library-table/index.ts`**

This will be overwritten in Task 10. Placeholder ensures the directory exists in git and TS resolves it.

```ts
export {}
```

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors. Note that `components/library-table.tsx` (the legacy file) and `components/library-table/` (the new directory) now coexist — Node module resolution still picks the `.tsx` file, so behavior is unchanged. We remove the legacy file in Task 10.

- [ ] **Step 5: Commit**

```bash
git add components/library-table/types.ts components/library-table/sort-icon.tsx components/library-table/index.ts
git commit -m "feat(library-table): scaffold module with types and SortIcon"
```

---

## Task 4: Add GameCoverCell with TDD

**Files:**
- Create: `tests/components/library-table/game-cover-cell.test.tsx`
- Create: `components/library-table/cells/game-cover-cell.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/library-table/game-cover-cell.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test -- tests/components/library-table/game-cover-cell.test.tsx
```

Expected: FAIL — module `@/components/library-table/cells/game-cover-cell` cannot be found.

- [ ] **Step 3: Implement `components/library-table/cells/game-cover-cell.tsx`**

```tsx
'use client'

import { useState } from 'react'

const GAME_PLACEHOLDER_IMAGE = '/game-placeholder.svg'

type Props = { src: string; name: string }

export function GameCoverCell({ src, name }: Props) {
  const [imageSrc, setImageSrc] = useState(src || GAME_PLACEHOLDER_IMAGE)

  return (
    <img
      src={imageSrc}
      alt={name}
      width={92}
      height={43}
      className="h-[43px] w-[92px] rounded object-cover"
      onError={() => {
        if (imageSrc !== GAME_PLACEHOLDER_IMAGE) setImageSrc(GAME_PLACEHOLDER_IMAGE)
      }}
    />
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test -- tests/components/library-table/game-cover-cell.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/library-table/cells/game-cover-cell.tsx tests/components/library-table/game-cover-cell.test.tsx
git commit -m "feat(library-table): GameCoverCell with placeholder fallback"
```

---

## Task 5: Add HltbCell with TDD

**Files:**
- Create: `tests/components/library-table/hltb-cell.test.tsx`
- Create: `components/library-table/cells/hltb-cell.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/library-table/hltb-cell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { HltbCell } from '@/components/library-table/cells/hltb-cell'

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

  it('still renders the value when loading but the row already has HLTB data', () => {
    renderHltbCell({ value: 12, isLoading: true, rowHasHltb: true })
    expect(screen.getByText('12h')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test -- tests/components/library-table/hltb-cell.test.tsx
```

Expected: FAIL — module `@/components/library-table/cells/hltb-cell` cannot be found.

- [ ] **Step 3: Implement `components/library-table/cells/hltb-cell.tsx`**

```tsx
'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Props = {
  value: number | null
  isLoading: boolean
  rowHasHltb: boolean
}

export function HltbCell({ value, isLoading, rowHasHltb }: Props) {
  if (isLoading && !rowHasHltb) return <Skeleton className="h-4 w-10" />
  if (value === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground cursor-help">--</span>
        </TooltipTrigger>
        <TooltipContent>HLTB data unavailable</TooltipContent>
      </Tooltip>
    )
  }
  return <>{value}h</>
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test -- tests/components/library-table/hltb-cell.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/library-table/cells/hltb-cell.tsx tests/components/library-table/hltb-cell.test.tsx
git commit -m "feat(library-table): HltbCell with skeleton, placeholder, and value branches"
```

---

## Task 6: Add useSortedRows hook with TDD

**Files:**
- Create: `tests/components/library-table/use-sorted-rows.test.ts`
- Create: `components/library-table/use-sorted-rows.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/components/library-table/use-sorted-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GameRow } from '@/types/game'
import { sortRows } from '@/components/library-table/use-sorted-rows'

function game(overrides: Partial<GameRow> & { name: string; appid: number }): GameRow {
  return {
    appid: overrides.appid,
    name: overrides.name,
    playtimeMinutes: 0,
    headerImageUrl: '',
    hltb: null,
    ...overrides,
  }
}

const rowA = game({ appid: 1, name: 'Alpha', playtimeMinutes: 120 })
const rowB = game({
  appid: 2,
  name: 'Bravo',
  playtimeMinutes: 60,
  hltb: { mainHours: 5, mainExtraHours: 10, completionistHours: 20, hltbId: 1, matchedName: 'Bravo' },
})
const rowC = game({
  appid: 3,
  name: 'Charlie',
  playtimeMinutes: 180,
  hltb: { mainHours: 15, mainExtraHours: 25, completionistHours: 40, hltbId: 2, matchedName: 'Charlie' },
})

describe('sortRows', () => {
  it('returns the input array as-is when sortColumns is empty', () => {
    const rows = [rowA, rowB, rowC]
    expect(sortRows(rows, [])).toBe(rows)
  })

  it('sorts strings ascending using locale-aware compare', () => {
    const out = sortRows([rowC, rowA, rowB], [{ columnKey: 'name', direction: 'ASC' }])
    expect(out.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('sorts strings descending', () => {
    const out = sortRows([rowA, rowB, rowC], [{ columnKey: 'name', direction: 'DESC' }])
    expect(out.map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })

  it('sorts numbers ascending', () => {
    const out = sortRows(
      [rowA, rowB, rowC],
      [{ columnKey: 'steamHours', direction: 'ASC' }],
    )
    expect(out.map((r) => r.playtimeMinutes)).toEqual([60, 120, 180])
  })

  it('places missing HLTB values last regardless of direction (ASC)', () => {
    const out = sortRows(
      [rowA, rowB, rowC],
      [{ columnKey: 'hltbMain', direction: 'ASC' }],
    )
    expect(out.map((r) => r.name)).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })

  it('places missing HLTB values last regardless of direction (DESC)', () => {
    const out = sortRows(
      [rowA, rowB, rowC],
      [{ columnKey: 'hltbMain', direction: 'DESC' }],
    )
    expect(out.map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })

  it('does not mutate the input array', () => {
    const rows = [rowC, rowA, rowB]
    const snapshot = [...rows]
    sortRows(rows, [{ columnKey: 'name', direction: 'ASC' }])
    expect(rows).toEqual(snapshot)
  })

  it('ignores unknown columnKey and returns input as-is', () => {
    const rows = [rowC, rowA]
    const out = sortRows(rows, [{ columnKey: 'unknown' as 'name', direction: 'ASC' }])
    expect(out).toBe(rows)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test -- tests/components/library-table/use-sorted-rows.test.ts
```

Expected: FAIL — module `@/components/library-table/use-sorted-rows` cannot be found.

- [ ] **Step 3: Implement `components/library-table/use-sorted-rows.ts`**

```ts
import { useMemo } from 'react'
import type { SortColumn } from 'react-data-grid'
import type { GameRow } from '@/types/game'
import { SORTABLE_KEYS, type LibrarySortKey } from './types'

type Accessor = (row: GameRow) => string | number | null | undefined

const accessors: Record<LibrarySortKey, Accessor> = {
  name: (r) => r.name,
  steamHours: (r) => r.playtimeMinutes,
  hltbMain: (r) => r.hltb?.mainHours ?? undefined,
  hltbMainExtra: (r) => r.hltb?.mainExtraHours ?? undefined,
  hltbCompletionist: (r) => r.hltb?.completionistHours ?? undefined,
}

function isSortable(key: string): key is LibrarySortKey {
  return (SORTABLE_KEYS as readonly string[]).includes(key)
}

function isMissing(v: unknown): v is null | undefined {
  return v === null || v === undefined
}

function compare(
  a: GameRow,
  b: GameRow,
  accessor: Accessor,
  direction: 'ASC' | 'DESC',
): number {
  const va = accessor(a)
  const vb = accessor(b)
  if (isMissing(va) && isMissing(vb)) return 0
  if (isMissing(va)) return 1
  if (isMissing(vb)) return -1
  const cmp =
    typeof va === 'string' && typeof vb === 'string'
      ? va.localeCompare(vb)
      : (va as number) - (vb as number)
  return direction === 'DESC' ? -cmp : cmp
}

export function sortRows(
  rows: readonly GameRow[],
  sortColumns: readonly SortColumn[],
): readonly GameRow[] {
  if (sortColumns.length === 0) return rows
  const first = sortColumns[0]
  if (!isSortable(first.columnKey)) return rows
  const accessor = accessors[first.columnKey]
  return [...rows].sort((a, b) => compare(a, b, accessor, first.direction))
}

export function useSortedRows(
  rows: readonly GameRow[],
  sortColumns: readonly SortColumn[],
): readonly GameRow[] {
  return useMemo(() => sortRows(rows, sortColumns), [rows, sortColumns])
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test -- tests/components/library-table/use-sorted-rows.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add components/library-table/use-sorted-rows.ts tests/components/library-table/use-sorted-rows.test.ts
git commit -m "feat(library-table): useSortedRows hook with nulls-last comparator"
```

---

## Task 7: Add usePersistedSortColumns hook with zod-validated storage

**Files:**
- Create: `tests/components/library-table/use-persisted-sort-columns.test.ts`
- Create: `components/library-table/use-persisted-sort-columns.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/components/library-table/use-persisted-sort-columns.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePersistedSortColumns } from '@/components/library-table/use-persisted-sort-columns'
import { SORT_STORAGE_KEY } from '@/components/library-table/types'

describe('usePersistedSortColumns', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('returns the default when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'name', direction: 'ASC' }])
  })

  it('loads a valid stored value', () => {
    window.localStorage.setItem(
      SORT_STORAGE_KEY,
      JSON.stringify([{ columnKey: 'steamHours', direction: 'DESC' }]),
    )
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'steamHours', direction: 'DESC' }])
  })

  it('falls back to default when stored value uses the legacy {id, desc} shape', () => {
    window.localStorage.setItem(
      SORT_STORAGE_KEY,
      JSON.stringify([{ id: 'name', desc: false }]),
    )
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'name', direction: 'ASC' }])
  })

  it('falls back to default when stored value is malformed JSON', () => {
    window.localStorage.setItem(SORT_STORAGE_KEY, '{not json')
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'name', direction: 'ASC' }])
  })

  it('falls back to default when stored value references an unknown column key', () => {
    window.localStorage.setItem(
      SORT_STORAGE_KEY,
      JSON.stringify([{ columnKey: 'ghost', direction: 'ASC' }]),
    )
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'name', direction: 'ASC' }])
  })

  it('persists changes back to localStorage', () => {
    const { result } = renderHook(() => usePersistedSortColumns())
    act(() => {
      result.current[1]([{ columnKey: 'hltbMain', direction: 'DESC' }])
    })
    expect(window.localStorage.getItem(SORT_STORAGE_KEY)).toBe(
      JSON.stringify([{ columnKey: 'hltbMain', direction: 'DESC' }]),
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test -- tests/components/library-table/use-persisted-sort-columns.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/library-table/use-persisted-sort-columns.ts`**

```ts
import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  DEFAULT_SORT_COLUMNS,
  SORTABLE_KEYS,
  SORT_STORAGE_KEY,
  type LibrarySortColumn,
} from './types'

const sortColumnSchema = z.object({
  columnKey: z.enum(SORTABLE_KEYS),
  direction: z.enum(['ASC', 'DESC']),
})
const sortColumnsSchema = z.array(sortColumnSchema)

function readStored(): LibrarySortColumn[] {
  if (typeof window === 'undefined') return DEFAULT_SORT_COLUMNS
  let raw: string | null
  try {
    raw = window.localStorage.getItem(SORT_STORAGE_KEY)
  } catch {
    return DEFAULT_SORT_COLUMNS
  }
  if (!raw) return DEFAULT_SORT_COLUMNS
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_SORT_COLUMNS
  }
  const result = sortColumnsSchema.safeParse(parsed)
  return result.success ? (result.data as LibrarySortColumn[]) : DEFAULT_SORT_COLUMNS
}

export function usePersistedSortColumns(): readonly [
  LibrarySortColumn[],
  (next: LibrarySortColumn[]) => void,
] {
  const [sortColumns, setSortColumns] = useState<LibrarySortColumn[]>(readStored)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sortColumns))
    } catch {
      // localStorage may be unavailable; sorting still works in-memory.
    }
  }, [sortColumns])

  return [sortColumns, setSortColumns] as const
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test -- tests/components/library-table/use-persisted-sort-columns.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/library-table/use-persisted-sort-columns.ts tests/components/library-table/use-persisted-sort-columns.test.ts
git commit -m "feat(library-table): usePersistedSortColumns with zod-validated storage"
```

---

## Task 8: Add useLibraryColumns hook

This hook returns the `Column<GameRow>[]` definition consumed by `<DataGrid>`. No dedicated tests — its behavior is exercised by the smoke test in Task 10 and by visual verification in Task 13.

**Files:**
- Create: `components/library-table/use-library-columns.ts`

- [ ] **Step 1: Implement `components/library-table/use-library-columns.ts`**

```ts
import { useMemo } from 'react'
import type { Column } from 'react-data-grid'
import type { GameRow } from '@/types/game'
import { GameCoverCell } from './cells/game-cover-cell'
import { HltbCell } from './cells/hltb-cell'
import { SortIcon } from './sort-icon'

function hours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

function renderHeaderCell(name: string) {
  return function HeaderCell({
    column,
    sortDirection,
  }: {
    column: { sortable?: boolean }
    sortDirection: 'ASC' | 'DESC' | undefined
  }) {
    return (
      <span className="flex items-center whitespace-nowrap">
        {name}
        {column.sortable ? <SortIcon direction={sortDirection} /> : null}
      </span>
    )
  }
}

export function useLibraryColumns(hltbLoading: boolean): readonly Column<GameRow>[] {
  return useMemo<Column<GameRow>[]>(
    () => [
      {
        key: 'cover',
        name: '',
        width: 100,
        sortable: false,
        renderCell: ({ row }) => <GameCoverCell src={row.headerImageUrl} name={row.name} />,
      },
      {
        key: 'name',
        name: 'Name',
        sortable: true,
        renderHeaderCell: renderHeaderCell('Name'),
        renderCell: ({ row }) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: 'steamHours',
        name: 'Steam played',
        sortable: true,
        renderHeaderCell: renderHeaderCell('Steam played'),
        renderCell: ({ row }) => `${hours(row.playtimeMinutes)}h`,
      },
      {
        key: 'hltbMain',
        name: 'HLTB Main',
        sortable: true,
        renderHeaderCell: renderHeaderCell('HLTB Main'),
        renderCell: ({ row }) => (
          <HltbCell
            value={row.hltb?.mainHours ?? null}
            isLoading={hltbLoading}
            rowHasHltb={row.hltb !== null}
          />
        ),
      },
      {
        key: 'hltbMainExtra',
        name: 'HLTB +Extra',
        sortable: true,
        renderHeaderCell: renderHeaderCell('HLTB +Extra'),
        renderCell: ({ row }) => (
          <HltbCell
            value={row.hltb?.mainExtraHours ?? null}
            isLoading={hltbLoading}
            rowHasHltb={row.hltb !== null}
          />
        ),
      },
      {
        key: 'hltbCompletionist',
        name: 'HLTB 100%',
        sortable: true,
        renderHeaderCell: renderHeaderCell('HLTB 100%'),
        renderCell: ({ row }) => (
          <HltbCell
            value={row.hltb?.completionistHours ?? null}
            isLoading={hltbLoading}
            rowHasHltb={row.hltb !== null}
          />
        ),
      },
    ],
    [hltbLoading],
  )
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If `renderHeaderCell` parameter type doesn't match RDG's actual `RenderHeaderCellProps` signature, adjust the parameter types to use `import type { RenderHeaderCellProps } from 'react-data-grid'` and `function HeaderCell(props: RenderHeaderCellProps<GameRow>)`. The shape above (`column.sortable`, `sortDirection`) is documented and stable in v7.

- [ ] **Step 3: Commit**

```bash
git add components/library-table/use-library-columns.ts
git commit -m "feat(library-table): useLibraryColumns with custom header SortIcon"
```

---

## Task 9: Add library-table.css with shadcn token mapping

**Files:**
- Create: `components/library-table/library-table.css`

- [ ] **Step 1: Create the CSS file**

Note: shadcn in this project uses Tailwind 4 with raw `oklch(...)` values exposed as bare CSS custom properties (`--background`, `--foreground`, `--muted`, `--border`, `--ring`) defined in `app/globals.css`. We map them to `--rdg-*` directly (no `hsl(var(...))` wrapper — these are already complete color values).

```css
.rdg {
  --rdg-color: var(--foreground);
  --rdg-background-color: var(--background);
  --rdg-header-background-color: var(--muted);
  --rdg-row-hover-background-color: color-mix(in oklch, var(--muted) 50%, transparent);
  --rdg-border-color: var(--border);
  --rdg-font-size: 0.875rem;
  --rdg-selection-color: var(--ring);
  block-size: 100%;
}

.rdg .rdg-header-row {
  font-weight: 500;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/library-table/library-table.css
git commit -m "style(library-table): map --rdg-* to shadcn oklch tokens"
```

---

## Task 10: Assemble LibraryTable, wire CSS in root layout, delete legacy file

This task:
1. Builds the orchestrator `library-table.tsx`.
2. Replaces the temporary `index.ts` placeholder with the real barrel.
3. Adds a minimal smoke test.
4. **Deletes** the legacy `components/library-table.tsx` file so module resolution picks the new directory.
5. **Deletes** the legacy `tests/components/library-table.test.tsx` (its scenarios are already covered by `game-cover-cell.test.tsx` from Task 4; leaving it would break the suite because it imports the deleted file).
6. Wires both stylesheets into `app/layout.tsx`.

**Files:**
- Create: `components/library-table/library-table.tsx`
- Modify: `components/library-table/index.ts`
- Create: `tests/components/library-table/library-table.smoke.test.tsx`
- Delete: `components/library-table.tsx`
- Delete: `tests/components/library-table.test.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write the smoke test (failing)**

Create `tests/components/library-table/library-table.smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibraryTable } from '@/components/library-table'

describe('LibraryTable smoke', () => {
  it('mounts with empty rows and exposes a grid role', () => {
    render(<LibraryTable rows={[]} hltbLoading={false} />)
    expect(screen.getByRole('grid')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the smoke test to verify it fails**

```bash
pnpm test -- tests/components/library-table/library-table.smoke.test.tsx
```

Expected: FAIL — `LibraryTable` not exported (current `index.ts` is the empty placeholder from Task 3).

- [ ] **Step 3: Implement `components/library-table/library-table.tsx`**

```tsx
'use client'

import { DataGrid, type SortColumn } from 'react-data-grid'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GameRow } from '@/types/game'
import { useLibraryColumns } from './use-library-columns'
import { usePersistedSortColumns } from './use-persisted-sort-columns'
import { useSortedRows } from './use-sorted-rows'

type Props = {
  rows: readonly GameRow[]
  hltbLoading: boolean
}

export function LibraryTable({ rows, hltbLoading }: Props) {
  const columns = useLibraryColumns(hltbLoading)
  const [sortColumns, setSortColumns] = usePersistedSortColumns()
  const sortedRows = useSortedRows(rows, sortColumns)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-md border overflow-hidden h-[calc(100vh-280px)] min-h-[320px]">
        <DataGrid
          className="rdg-light"
          columns={columns}
          rows={sortedRows}
          rowKeyGetter={(row) => row.appid}
          sortColumns={sortColumns as SortColumn[]}
          onSortColumnsChange={(next) => setSortColumns(next as typeof sortColumns)}
          rowHeight={56}
          headerRowHeight={40}
          defaultColumnOptions={{ sortable: true, resizable: false }}
          renderers={{
            noRowsFallback: (
              <div className="flex h-24 items-center justify-center text-sm">
                No games match the current filters.
              </div>
            ),
          }}
        />
      </div>
    </TooltipProvider>
  )
}
```

- [ ] **Step 4: Replace `components/library-table/index.ts` with the real barrel**

Overwrite the file contents:

```ts
export { LibraryTable } from './library-table'
```

- [ ] **Step 5: Delete the legacy file and the legacy test**

```bash
git rm components/library-table.tsx tests/components/library-table.test.tsx
```

Deleting `components/library-table.tsx` is critical: while both it and `components/library-table/` coexist, TS resolves the file first and the new module is unreachable. The legacy test must go in the same step because it imports the deleted file — leaving it would break `pnpm test` for the duration of this commit.

- [ ] **Step 6: Wire stylesheets into `app/layout.tsx`**

Edit `app/layout.tsx`. Replace the existing import block:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
```

with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "react-data-grid/lib/styles.css";
import "@/components/library-table/library-table.css";
import { Providers } from "@/components/providers";
```

Order matters: `globals.css` defines `--background`/`--foreground` first, RDG's defaults next, then our overrides win.

- [ ] **Step 7: Run the smoke test to verify it passes**

```bash
pnpm test -- tests/components/library-table/library-table.smoke.test.tsx
```

Expected: PASS. If it fails because RDG calls `Element.prototype.scrollIntoView`, add this line to `tests/setup.ts` and re-run:

```ts
Element.prototype.scrollIntoView = function scrollIntoView() {}
```

If failure is something else (e.g. `getBoundingClientRect`), drop the smoke test — atomic tests already cover all logic. Delete the smoke test file in that case.

- [ ] **Step 8: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass — the legacy test was removed in Step 5, the new smoke test passes from Step 7 (or was dropped if shims couldn't be made to work), and atomic tests from Tasks 4–7 continue to pass.

- [ ] **Step 9: Commit**

```bash
git add components/library-table/library-table.tsx components/library-table/index.ts tests/components/library-table/library-table.smoke.test.tsx app/layout.tsx
git commit -m "feat(library-table): assemble DataGrid module, wire CSS, drop legacy file"
```

If the smoke test was dropped in Step 7, exclude `tests/components/library-table/library-table.smoke.test.tsx` from the add. The `git rm` from Step 5 is already staged.

---

## Task 11: Simplify LibraryScreen

Drop sort state, persistence, parser, sort-related constants, and the two sort-related effects. The new contract is a 2-prop call to `LibraryTable`.

**Files:**
- Modify: `app/library/library-screen.tsx`

- [ ] **Step 1: Remove sort-related code and simplify the LibraryTable call**

Open `app/library/library-screen.tsx` and make the following changes.

**a) Imports** — drop the `SortingState` import and remove `parseStoredSorting`-related state/effects below. New top of file:

```tsx
'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AuthButton } from '@/components/auth-button'
import { LibraryFilters, type LibraryFiltersValue } from '@/components/library-filters'
import { LibraryTable } from '@/components/library-table'
import { RefreshControls } from '@/components/refresh-controls'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { refreshHltb, useHltb } from '@/hooks/use-hltb'
import { refreshLibrary, useLibrary } from '@/hooks/use-library'
import { LibraryFetchError } from '@/lib/errors'
import { filterByHltbRange, searchByName } from '@/lib/library/filters'
import { mergeGames } from '@/lib/library/merge'
```

**b) Delete** the following blocks from the file:
- `const LIBRARY_SORTING_STORAGE_KEY = 'hltb-steam:library-sorting'`
- `const SORTABLE_COLUMN_IDS = [...] as const`
- `const DEFAULT_LIBRARY_SORTING: SortingState = [{ id: 'name', desc: false }]`
- the entire `function parseStoredSorting(value: string | null): SortingState | null { ... }`
- inside `LibraryScreen`: `const [sorting, setSorting] = useState<SortingState>(DEFAULT_LIBRARY_SORTING)` and `const [sortingLoaded, setSortingLoaded] = useState(false)`
- the two `useEffect`s that load/save `sorting` to localStorage

Keep `LIBRARY_FILTERS_STORAGE_KEY`, `DEFAULT_LIBRARY_FILTERS`, `parseStoredFilters`, and the filter-related state/effects — those are unrelated.

**c) Replace the `<LibraryTable .../>` call** at the bottom:

Before:

```tsx
<LibraryTable
  rows={visibleRows}
  hltbLoading={hltb.isFetching}
  sorting={sorting}
  onSortingChange={setSorting}
/>
```

After:

```tsx
<LibraryTable rows={visibleRows} hltbLoading={hltb.isFetching} />
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If `Skeleton` import becomes unused after the cleanup, leave it — it is still used for the loading state at the bottom of `LibraryScreen`.

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/library/library-screen.tsx
git commit -m "refactor(library-screen): drop sort state, delegate to LibraryTable"
```

---

## Task 12: Remove @tanstack/react-table dependency

The legacy test was already deleted in Task 10. This task only drops the now-unused dependency.

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Confirm no remaining usage of @tanstack/react-table**

```bash
git grep "@tanstack/react-table"
```

Expected: matches only in `package.json`, `pnpm-lock.yaml`, and `docs/` (markdown). Zero matches in `app/`, `components/`, `lib/`, `hooks/`, `tests/`. If anything else turns up, stop and address it before continuing.

- [ ] **Step 2: Remove the dependency**

```bash
pnpm remove @tanstack/react-table
```

Expected: `package.json` no longer lists `@tanstack/react-table`; lockfile updates.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Run typecheck and lint**

```bash
pnpm tsc --noEmit
pnpm lint
```

Expected: both clean. If `pnpm lint` complains about unused imports in any touched file, remove them and re-run.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: remove @tanstack/react-table"
```

---

## Task 13: Final verification — build, dev server, visual check

**Files:** none (verification only)

- [ ] **Step 1: Production build**

```bash
pnpm run build
```

Expected: build completes without errors or new warnings related to `library-table` or CSS imports.

- [ ] **Step 2: Start the dev server in the background**

```bash
pnpm run dev
```

Wait for the "Ready" line, then open the app in the preview browser at the URL printed in the dev-server output (typically `http://localhost:3000/library`). Authenticate with Steam if required to reach the library screen.

- [ ] **Step 3: Visual checks — light theme**

Verify in the browser:
- Grid renders with rounded border identical to current shadcn look.
- Header row has muted background; data rows have hover state with `--muted/0.5`.
- Cover column shows 92×43 images; broken sources fall back to `/game-placeholder.svg`.
- HLTB cells show skeletons during HLTB fetch (refresh HLTB to reproduce), `--` with tooltip for unmatched games, `Nh` otherwise.
- Click each sortable header — order changes; click again — reverses; clicking a different header switches to it. `null`/`undefined` HLTB values stay at the bottom in both ASC and DESC.
- Reload the page — the most recent sort selection is restored from localStorage.

- [ ] **Step 4: Visual checks — dark theme**

Toggle the theme (if there is a toggle) or set system to dark. Verify the grid background, header, borders, and hover all use the dark `oklch` tokens. The Tooltip on `--` cells remains readable.

- [ ] **Step 5: Virtualization sanity**

With a sizeable library (the Steam account in test should have ≥50 games), open the browser DevTools Elements panel. Inspect the grid container — confirm only a subset of `<div role="row">` elements is in the DOM and the number changes as you scroll. This confirms virtualization is active.

- [ ] **Step 6: Stop the dev server**

Use the terminal/tool that started it.

- [ ] **Step 7: Final commit only if any tweaks were needed**

If Step 3/4/5 surfaced a tweak (e.g. adjusted height value, additional CSS override), commit it now:

```bash
git add <changed-files>
git commit -m "fix(library-table): adjust <thing> after visual verification"
```

If nothing required changes, no commit. Done.

---

## Notes

- **Beta version pinning.** `react-data-grid@7.0.0-beta.59` is pinned without `^` because beta releases routinely contain breaking changes. Treat any future upgrade as a deliberate review task.
- **Old localStorage values.** Users whose browsers had `hltb-steam:library-sorting` in the previous `[{ id, desc }]` shape will silently get the default sort (`name ASC`) on first load and the new format from then on. This is an accepted product decision (see spec §4).
- **Smoke test.** The smoke test in Task 10 is a tripwire. If RDG's jsdom integration deteriorates in a future minor and shims become impractical, dropping the smoke test is fine — atomic tests (Tasks 4–7) cover all branching logic.
- **No multi-column sort.** RDG supports Ctrl+Click multi-sort by default; we don't advertise it, but we also don't disable it. The comparator only honors the first `SortColumn`. If a user discovers Ctrl+Click, secondary columns are silently ignored — that's an acceptable trade-off for MVP.
