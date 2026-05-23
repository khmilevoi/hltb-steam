# HLTB × Steam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 16 app that signs the user in through Steam OpenID, fetches their library, enriches it with HowLongToBeat times, and lets them search/sort/filter games.

**Architecture:** Client-rendered library page (Client Component) backed by Next.js Route Handlers that call Steam Web API and the `howlongtobeat` npm package. Both upstream responses are cached in Upstash Redis (TTL 1h for library, 7d for HLTB) with manual refresh buttons that pass `force=1`. TanStack Query manages client-side cache with localStorage persistence. All non-TanStack-Query code follows the **errore** errors-as-values convention.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Auth.js v5 + `next-auth-steam`, Upstash Redis REST, TanStack Query v5 + `@tanstack/query-sync-storage-persister`, shadcn/ui + Tailwind CSS, TanStack Table v8, sonner, `howlongtobeat`, `p-limit`, `date-fns`, `string-similarity`, `errore`, Vitest, pnpm.

**Reference spec:** `docs/superpowers/specs/2026-05-23-hltb-steam-design.md`

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `.env.local.example`
- Modify: `.gitignore` (add `.env.local`)

- [ ] **Step 1: Run create-next-app non-interactively**

Run inside the empty `hltb-steam/` directory:

```bash
pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir false --import-alias "@/*" --use-pnpm --turbopack --yes
```

Expected: scaffold created (`app/`, `package.json`, `tsconfig.json`, `next.config.ts`, etc).

- [ ] **Step 2: Update `tsconfig.json` to include ESNext.Disposable**

The errore convention uses `await using` / `DisposableStack`. Open `tsconfig.json` and ensure the `lib` array contains `"ESNext.Disposable"`:

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ESNext", "ESNext.Disposable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./*"] }
  }
}
```

`noUncheckedIndexedAccess` makes our `Record<appid, HltbEntry | null>` lookups type-safe.

- [ ] **Step 3: Create `.env.local.example`**

```
# Steam — get from https://steamcommunity.com/dev/apikey
STEAM_API_KEY=

# NextAuth — generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Upstash Redis — from Upstash console or `vercel env pull`
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 4: Verify scaffold compiles**

```bash
pnpm install
pnpm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold Next.js 16 + TypeScript + Tailwind"
```

---

## Task 2: Install runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install all runtime deps in one command**

```bash
pnpm add errore next-auth@beta next-auth-steam @upstash/redis @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister @tanstack/react-table howlongtobeat p-limit date-fns string-similarity sonner zod
```

- [ ] **Step 2: Install dev deps**

```bash
pnpm add -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/dom jsdom @types/string-similarity
```

- [ ] **Step 3: Verify install is clean**

```bash
rtk pnpm list --depth=0
```

Expected: all packages above present, no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install runtime and dev dependencies"
```

---

## Task 3: Vitest config

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add scripts)

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import '@testing-library/dom'
// Placeholder for future global setup (cleanup, env mocks).
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

- [ ] **Step 4: Verify a placeholder test runs**

Create `tests/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run:

```bash
rtk pnpm test
```

Expected: `1 passed`. Then delete `tests/sanity.test.ts`.

```bash
rm tests/sanity.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/setup.ts package.json
git commit -m "chore: configure Vitest with jsdom"
```

---

## Task 4: Initialize shadcn/ui

**Files:**
- Create: `components.json`
- Create: `lib/utils.ts`
- Create: `components/ui/*` (button, input, slider, table, card, skeleton, sonner)

- [ ] **Step 1: Run shadcn init**

```bash
pnpm dlx shadcn@latest init --yes --base-color slate
```

Expected: creates `components.json`, `lib/utils.ts` (with `cn` helper), updates `tailwind.config` and `app/globals.css`.

- [ ] **Step 2: Add the components we need**

```bash
pnpm dlx shadcn@latest add button input slider table card skeleton sonner tooltip --yes
```

Expected: each component created under `components/ui/`.

- [ ] **Step 3: Verify import**

Create temp file `components/_smoke.tsx`:

```tsx
import { Button } from '@/components/ui/button'
export default function Smoke() { return <Button>ok</Button> }
```

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors. Then delete the file:

```bash
rm components/_smoke.tsx
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: init shadcn/ui with required components"
```

---

## Task 5: Tagged errors (`lib/errors.ts`)

**Files:**
- Create: `lib/errors.ts`
- Test: `tests/lib/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/errors.test.ts
import { describe, it, expect } from 'vitest'
import * as errore from 'errore'
import {
  SteamPrivateProfileError,
  SteamUnavailableError,
  HltbRateLimitError,
  HltbFetchError,
  KvError,
  UnauthenticatedError,
  LibraryFetchError,
  HltbApiError,
} from '@/lib/errors'

describe('tagged errors', () => {
  it('SteamPrivateProfileError carries steamId', () => {
    const e = new SteamPrivateProfileError({ steamId: '76561198000000000' })
    expect(e).toBeInstanceOf(Error)
    expect(e._tag).toBe('SteamPrivateProfileError')
    expect(e.steamId).toBe('76561198000000000')
    expect(e.message).toContain('76561198000000000')
  })

  it('SteamUnavailableError carries reason', () => {
    const e = new SteamUnavailableError({ reason: 'HTTP 502' })
    expect(e._tag).toBe('SteamUnavailableError')
    expect(e.reason).toBe('HTTP 502')
  })

  it('HltbRateLimitError carries retryAfterMs', () => {
    const e = new HltbRateLimitError({ retryAfterMs: 10000 })
    expect(e.retryAfterMs).toBe(10000)
  })

  it('HltbFetchError carries name and reason', () => {
    const e = new HltbFetchError({ name: 'Dishonored', reason: 'search threw' })
    expect(e.name_).toBeUndefined()
    expect(e.message).toContain('Dishonored')
    expect(e.message).toContain('search threw')
  })

  it('KvError carries op and key', () => {
    const e = new KvError({ op: 'get', key: 'library:abc' })
    expect(e.op).toBe('get')
    expect(e.key).toBe('library:abc')
  })

  it('UnauthenticatedError tag is set', () => {
    const e = new UnauthenticatedError()
    expect(e._tag).toBe('UnauthenticatedError')
  })

  it('LibraryFetchError carries status and code', () => {
    const e = new LibraryFetchError({ status: 502, code: 'steam_unavailable' })
    expect(e.status).toBe(502)
    expect(e.code).toBe('steam_unavailable')
  })

  it('HltbApiError carries status and code', () => {
    const e = new HltbApiError({ status: 401, code: 'unauthenticated' })
    expect(e.status).toBe(401)
  })

  it('matchError routes by _tag', () => {
    const e: Error = new SteamPrivateProfileError({ steamId: 'x' })
    const result = errore.matchError(e, {
      SteamPrivateProfileError: () => 'private',
      Error: () => 'other',
    })
    expect(result).toBe('private')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
rtk pnpm test tests/lib/errors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/errors.ts`**

```ts
import * as errore from 'errore'

export class SteamPrivateProfileError extends errore.createTaggedError({
  name: 'SteamPrivateProfileError',
  message: 'Steam profile $steamId is private or has hidden game details',
}) {}

export class SteamUnavailableError extends errore.createTaggedError({
  name: 'SteamUnavailableError',
  message: 'Steam Web API request failed: $reason',
}) {}

export class HltbRateLimitError extends errore.createTaggedError({
  name: 'HltbRateLimitError',
  message: 'HLTB rate limited; retry after $retryAfterMs ms',
}) {}

export class HltbFetchError extends errore.createTaggedError({
  name: 'HltbFetchError',
  message: 'HLTB lookup failed for "$name": $reason',
}) {}

export class KvError extends errore.createTaggedError({
  name: 'KvError',
  message: 'Upstash KV $op failed for key $key',
}) {}

export class UnauthenticatedError extends errore.createTaggedError({
  name: 'UnauthenticatedError',
  message: 'No valid Steam session',
}) {}

export class LibraryFetchError extends errore.createTaggedError({
  name: 'LibraryFetchError',
  message: 'Library API call failed: HTTP $status ($code)',
}) {}

export class HltbApiError extends errore.createTaggedError({
  name: 'HltbApiError',
  message: 'HLTB API call failed: HTTP $status ($code)',
}) {}
```

- [ ] **Step 4: Run to confirm pass**

```bash
rtk pnpm test tests/lib/errors.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/errors.ts tests/lib/errors.test.ts
git commit -m "feat(errors): tagged error classes via errore"
```

---

## Task 6: Data types (`types/game.ts`)

**Files:**
- Create: `types/game.ts`

- [ ] **Step 1: Create types**

```ts
// types/game.ts
export type SteamGame = {
  appid: number
  name: string
  playtimeMinutes: number
  headerImageUrl: string
}

export type HltbEntry = {
  mainHours: number | null
  mainExtraHours: number | null
  completionistHours: number | null
  hltbId: number
  matchedName: string
}

export type GameRow = SteamGame & { hltb: HltbEntry | null }

export type Cached<T> = { value: T; cachedAt: string }

export type SortField =
  | 'name'
  | 'steamHours'
  | 'hltbMain'
  | 'hltbMainExtra'
  | 'hltbCompletionist'

export type SortDirection = 'asc' | 'desc'
```

- [ ] **Step 2: Verify types compile**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/game.ts
git commit -m "feat(types): SteamGame, HltbEntry, GameRow, Cached, SortField"
```

---

## Task 7: Pure filters (`lib/library/filters.ts`)

**Files:**
- Create: `lib/library/filters.ts`
- Test: `tests/lib/library/filters.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/lib/library/filters.test.ts
import { describe, it, expect } from 'vitest'
import { searchByName, sortBy, filterByHltbRange } from '@/lib/library/filters'
import type { GameRow } from '@/types/game'

const rows: GameRow[] = [
  {
    appid: 1,
    name: 'Portal',
    playtimeMinutes: 600,
    headerImageUrl: 'x',
    hltb: { mainHours: 3, mainExtraHours: 5, completionistHours: 10, hltbId: 11, matchedName: 'Portal' },
  },
  {
    appid: 2,
    name: 'Witcher 3',
    playtimeMinutes: 6000,
    headerImageUrl: 'x',
    hltb: { mainHours: 52, mainExtraHours: 105, completionistHours: 180, hltbId: 22, matchedName: 'The Witcher 3' },
  },
  {
    appid: 3,
    name: 'Hades',
    playtimeMinutes: 0,
    headerImageUrl: 'x',
    hltb: null,
  },
]

describe('searchByName', () => {
  it('returns all rows for empty query', () => {
    expect(searchByName(rows, '')).toEqual(rows)
  })
  it('is case-insensitive substring match', () => {
    expect(searchByName(rows, 'PORT').map(r => r.appid)).toEqual([1])
  })
  it('returns empty when no match', () => {
    expect(searchByName(rows, 'doom')).toEqual([])
  })
})

describe('sortBy', () => {
  it('sorts by name asc', () => {
    expect(sortBy(rows, 'name', 'asc').map(r => r.appid)).toEqual([3, 1, 2])
  })
  it('sorts by name desc', () => {
    expect(sortBy(rows, 'name', 'desc').map(r => r.appid)).toEqual([2, 1, 3])
  })
  it('sorts by steamHours desc', () => {
    expect(sortBy(rows, 'steamHours', 'desc').map(r => r.appid)).toEqual([2, 1, 3])
  })
  it('sorts by hltbMain asc; null-hltb rows go to the end regardless of direction', () => {
    const asc = sortBy(rows, 'hltbMain', 'asc').map(r => r.appid)
    const desc = sortBy(rows, 'hltbMain', 'desc').map(r => r.appid)
    expect(asc).toEqual([1, 2, 3])
    expect(desc).toEqual([2, 1, 3])
  })
  it('sorts by hltbMainExtra asc', () => {
    expect(sortBy(rows, 'hltbMainExtra', 'asc').map(r => r.appid)).toEqual([1, 2, 3])
  })
  it('sorts by hltbCompletionist desc', () => {
    expect(sortBy(rows, 'hltbCompletionist', 'desc').map(r => r.appid)).toEqual([2, 1, 3])
  })
  it('returns empty for empty input', () => {
    expect(sortBy([], 'name', 'asc')).toEqual([])
  })
})

describe('filterByHltbRange', () => {
  it('includes rows whose mainHours is within [min, max]', () => {
    expect(filterByHltbRange(rows, 1, 10).map(r => r.appid)).toEqual([1])
  })
  it('excludes rows with null hltb', () => {
    expect(filterByHltbRange(rows, 0, 999).map(r => r.appid)).toEqual([1, 2])
  })
  it('excludes rows with null mainHours', () => {
    const r: GameRow = { ...rows[0], hltb: { ...rows[0].hltb!, mainHours: null } }
    expect(filterByHltbRange([r], 0, 100)).toEqual([])
  })
  it('returns all when min=0 and max=Infinity (still excludes nulls)', () => {
    expect(filterByHltbRange(rows, 0, Number.POSITIVE_INFINITY).length).toBe(2)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
rtk pnpm test tests/lib/library/filters.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// lib/library/filters.ts
import type { GameRow, SortField, SortDirection } from '@/types/game'

export function searchByName(rows: GameRow[], query: string): GameRow[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return rows
  return rows.filter((r) => r.name.toLowerCase().includes(q))
}

function fieldValue(row: GameRow, field: SortField): number | string | null {
  if (field === 'name') return row.name.toLowerCase()
  if (field === 'steamHours') return row.playtimeMinutes
  const hltb = row.hltb
  if (hltb === null) return null
  if (field === 'hltbMain') return hltb.mainHours
  if (field === 'hltbMainExtra') return hltb.mainExtraHours
  return hltb.completionistHours
}

export function sortBy(
  rows: GameRow[],
  field: SortField,
  direction: SortDirection,
): GameRow[] {
  const copy = [...rows]
  const dir = direction === 'asc' ? 1 : -1
  copy.sort((a, b) => {
    const va = fieldValue(a, field)
    const vb = fieldValue(b, field)
    // nulls always last, regardless of direction
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    if (typeof va === 'string' && typeof vb === 'string') {
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0
    }
    return ((va as number) - (vb as number)) * dir
  })
  return copy
}

export function filterByHltbRange(
  rows: GameRow[],
  minHours: number,
  maxHours: number,
): GameRow[] {
  return rows.filter((r) => {
    if (r.hltb === null) return false
    const m = r.hltb.mainHours
    if (m === null) return false
    return m >= minHours && m <= maxHours
  })
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
rtk pnpm test tests/lib/library/filters.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/library/filters.ts tests/lib/library/filters.test.ts
git commit -m "feat(filters): pure search/sort/range functions with null-last semantics"
```

---

## Task 8: HLTB matcher (`lib/hltb/matcher.ts`)

**Files:**
- Create: `lib/hltb/matcher.ts`
- Test: `tests/lib/hltb/matcher.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/lib/hltb/matcher.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeName, pickBestMatch } from '@/lib/hltb/matcher'

describe('normalizeName', () => {
  it('strips ™ and ®', () => {
    expect(normalizeName('Counter-Strike™ 2®')).toBe('counter-strike 2')
  })
  it('lowercases', () => {
    expect(normalizeName('Hades')).toBe('hades')
  })
  it('converts roman numerals up to X to arabic at word boundaries', () => {
    expect(normalizeName('Civilization VI')).toBe('civilization 6')
    expect(normalizeName('Final Fantasy IX')).toBe('final fantasy 9')
    expect(normalizeName('Diablo III')).toBe('diablo 3')
  })
  it('strips trailing edition/GOTY suffix', () => {
    expect(normalizeName('Skyrim - Special Edition')).toBe('skyrim')
    expect(normalizeName('The Witcher 3: Game of the Year Edition')).toBe('the witcher 3')
    expect(normalizeName('Borderlands GOTY')).toBe('borderlands')
  })
  it('collapses extra whitespace', () => {
    expect(normalizeName('  Hello   World  ')).toBe('hello world')
  })
})

describe('pickBestMatch', () => {
  const candidates = [
    { name: 'The Witcher 3: Wild Hunt', main: 52, mainExtra: 105, completionist: 180, id: 10 },
    { name: 'The Witcher', main: 12, mainExtra: 18, completionist: 30, id: 20 },
    { name: 'Witcher Adventure', main: 5, mainExtra: 8, completionist: 12, id: 30 },
  ]

  it('returns best fuzzy match', () => {
    const result = pickBestMatch(candidates, 'Witcher 3')
    expect(result?.matchedName).toBe('The Witcher 3: Wild Hunt')
    expect(result?.hltbId).toBe(10)
  })

  it('returns null when no candidate is above the similarity threshold', () => {
    expect(pickBestMatch(candidates, 'Doom Eternal')).toBeNull()
  })

  it('returns null on empty candidate list', () => {
    expect(pickBestMatch([], 'anything')).toBeNull()
  })

  it('maps candidate fields to HltbEntry shape', () => {
    const result = pickBestMatch(candidates, 'The Witcher')
    expect(result).toEqual({
      mainHours: 12,
      mainExtraHours: 18,
      completionistHours: 30,
      hltbId: 20,
      matchedName: 'The Witcher',
    })
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
rtk pnpm test tests/lib/hltb/matcher.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// lib/hltb/matcher.ts
import stringSimilarity from 'string-similarity'
import type { HltbEntry } from '@/types/game'

export type HltbCandidate = {
  name: string
  main: number | null
  mainExtra: number | null
  completionist: number | null
  id: number
}

const ROMAN: Record<string, string> = {
  ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
}

const EDITION_SUFFIX_RE =
  /\s*[:\-—]?\s*(game of the year edition|goty edition|goty|definitive edition|complete edition|enhanced edition|deluxe edition|special edition|remastered edition|remastered|directors? cut)\s*$/i

const MATCH_THRESHOLD = 0.6

export function normalizeName(input: string): string {
  let s = input.replace(/[™®©]/g, '').toLowerCase()
  s = s.replace(EDITION_SUFFIX_RE, '')
  s = s.replace(/\b([ivx]+)\b/g, (m) => ROMAN[m] ?? m)
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function pickBestMatch(
  candidates: HltbCandidate[],
  steamName: string,
): HltbEntry | null {
  if (candidates.length === 0) return null
  const target = normalizeName(steamName)
  const scored = candidates.map((c) => ({
    candidate: c,
    score: stringSimilarity.compareTwoStrings(target, normalizeName(c.name)),
  }))
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (best.score < MATCH_THRESHOLD) return null
  return {
    mainHours: best.candidate.main,
    mainExtraHours: best.candidate.mainExtra,
    completionistHours: best.candidate.completionist,
    hltbId: best.candidate.id,
    matchedName: best.candidate.name,
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
rtk pnpm test tests/lib/hltb/matcher.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/hltb/matcher.ts tests/lib/hltb/matcher.test.ts
git commit -m "feat(hltb): name normalization and fuzzy best-match picker"
```

---

## Task 9: Library merge (`lib/library/merge.ts`)

**Files:**
- Create: `lib/library/merge.ts`
- Test: `tests/lib/library/merge.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/lib/library/merge.test.ts
import { describe, it, expect } from 'vitest'
import { mergeGames } from '@/lib/library/merge'
import type { SteamGame, HltbEntry } from '@/types/game'

const steamGames: SteamGame[] = [
  { appid: 1, name: 'Portal', playtimeMinutes: 600, headerImageUrl: 'a' },
  { appid: 2, name: 'Hades',  playtimeMinutes: 0,   headerImageUrl: 'b' },
]
const hltb: Record<number, HltbEntry | null> = {
  1: { mainHours: 3, mainExtraHours: 5, completionistHours: 10, hltbId: 11, matchedName: 'Portal' },
  2: null,
}

describe('mergeGames', () => {
  it('attaches hltb entry by appid', () => {
    const rows = mergeGames(steamGames, hltb)
    expect(rows[0].hltb?.mainHours).toBe(3)
  })
  it('attaches null when no hltb entry for that appid', () => {
    const rows = mergeGames(steamGames, hltb)
    expect(rows[1].hltb).toBeNull()
  })
  it('treats missing keys in the map as null', () => {
    const rows = mergeGames(steamGames, {})
    expect(rows.every(r => r.hltb === null)).toBe(true)
  })
  it('returns empty array for empty steam input', () => {
    expect(mergeGames([], hltb)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
rtk pnpm test tests/lib/library/merge.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// lib/library/merge.ts
import type { SteamGame, HltbEntry, GameRow } from '@/types/game'

export function mergeGames(
  games: SteamGame[],
  hltb: Record<number, HltbEntry | null>,
): GameRow[] {
  return games.map((g) => ({ ...g, hltb: hltb[g.appid] ?? null }))
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
rtk pnpm test tests/lib/library/merge.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/library/merge.ts tests/lib/library/merge.test.ts
git commit -m "feat(library): merge Steam games with HLTB entries by appid"
```

---

## Task 10: Steam client (`lib/steam/client.ts`)

**Files:**
- Create: `lib/env.ts`
- Create: `lib/steam/client.ts`
- Test: `tests/lib/steam/client.test.ts`

- [ ] **Step 1: Create `lib/env.ts`**

```ts
// lib/env.ts
import { z } from 'zod'

const schema = z.object({
  STEAM_API_KEY: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
})

export const env = schema.parse(process.env)
```

For tests, env validation runs against `process.env`. We set placeholders in `tests/setup.ts` (next step).

- [ ] **Step 2: Add test env fixtures to `tests/setup.ts`**

```ts
// tests/setup.ts
import '@testing-library/dom'

process.env.STEAM_API_KEY = process.env.STEAM_API_KEY ?? 'test_key'
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'test_secret'
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
process.env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? 'http://localhost:8079'
process.env.UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? 'test_token'
```

- [ ] **Step 3: Write failing tests for Steam client**

```ts
// tests/lib/steam/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getOwnedGames } from '@/lib/steam/client'
import { SteamPrivateProfileError, SteamUnavailableError } from '@/lib/errors'

function mockFetchOnce(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )
}

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('getOwnedGames', () => {
  it('parses a populated library', async () => {
    mockFetchOnce({
      response: {
        game_count: 2,
        games: [
          { appid: 1, name: 'Portal',  playtime_forever: 600 },
          { appid: 2, name: 'Hades',   playtime_forever: 0 },
        ],
      },
    })
    const result = await getOwnedGames('76561198000000000')
    expect(Array.isArray(result)).toBe(true)
    if (!Array.isArray(result)) return
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      appid: 1, name: 'Portal', playtimeMinutes: 600,
      headerImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg',
    })
  })

  it('returns SteamPrivateProfileError on empty response', async () => {
    mockFetchOnce({ response: {} })
    const result = await getOwnedGames('76561198000000000')
    expect(result).toBeInstanceOf(SteamPrivateProfileError)
    if (result instanceof SteamPrivateProfileError) {
      expect(result.steamId).toBe('76561198000000000')
    }
  })

  it('returns SteamUnavailableError on HTTP 5xx', async () => {
    mockFetchOnce({}, { status: 502 })
    const result = await getOwnedGames('76561198000000000')
    expect(result).toBeInstanceOf(SteamUnavailableError)
  })

  it('returns SteamUnavailableError on fetch throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const result = await getOwnedGames('76561198000000000')
    expect(result).toBeInstanceOf(SteamUnavailableError)
  })

  it('returns SteamUnavailableError on invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 200 })))
    const result = await getOwnedGames('76561198000000000')
    expect(result).toBeInstanceOf(SteamUnavailableError)
  })
})
```

- [ ] **Step 4: Run to confirm fail**

```bash
rtk pnpm test tests/lib/steam/client.test.ts
```

Expected: module not found.

- [ ] **Step 5: Implement `lib/steam/client.ts`**

```ts
// lib/steam/client.ts
import { env } from '@/lib/env'
import { SteamPrivateProfileError, SteamUnavailableError } from '@/lib/errors'
import type { SteamGame } from '@/types/game'

type SteamApiGame = { appid: number; name: string; playtime_forever: number }
type SteamApiResponse = { response: { game_count?: number; games?: SteamApiGame[] } }

function toSteamGame(g: SteamApiGame): SteamGame {
  return {
    appid: g.appid,
    name: g.name,
    playtimeMinutes: g.playtime_forever,
    headerImageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
  }
}

export async function getOwnedGames(steamId: string) {
  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
    `?key=${env.STEAM_API_KEY}&steamid=${steamId}` +
    `&include_appinfo=1&include_played_free_games=1`

  const res = await fetch(url).catch(
    (e) => new SteamUnavailableError({ reason: 'fetch failed', cause: e }),
  )
  if (res instanceof Error) return res
  if (!res.ok) return new SteamUnavailableError({ reason: `HTTP ${res.status}` })

  const body = (await res.json().catch(
    (e) => new SteamUnavailableError({ reason: 'invalid JSON', cause: e }),
  )) as SteamApiResponse | SteamUnavailableError
  if (body instanceof Error) return body

  const games = body.response.games
  if (!games || games.length === 0) {
    return new SteamPrivateProfileError({ steamId })
  }

  return games.map(toSteamGame)
}
```

- [ ] **Step 6: Run to confirm pass**

```bash
rtk pnpm test tests/lib/steam/client.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/env.ts lib/steam/client.ts tests/lib/steam/client.test.ts tests/setup.ts
git commit -m "feat(steam): GetOwnedGames adapter with tagged errors"
```

---

## Task 11: HLTB client (`lib/hltb/client.ts`)

**Files:**
- Create: `lib/hltb/client.ts`
- Test: `tests/lib/hltb/client.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/lib/hltb/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HltbRateLimitError, HltbFetchError } from '@/lib/errors'

const searchMock = vi.fn()

vi.mock('howlongtobeat', () => {
  return {
    HowLongToBeatService: class {
      search = searchMock
    },
  }
})

beforeEach(() => { searchMock.mockReset() })

import { searchByName } from '@/lib/hltb/client'

describe('searchByName (hltb client)', () => {
  it('returns a matched entry', async () => {
    searchMock.mockResolvedValueOnce([
      { id: '10', name: 'The Witcher 3: Wild Hunt', gameplayMain: 52, gameplayMainExtra: 105, gameplayCompletionist: 180 },
    ])
    const result = await searchByName('Witcher 3')
    expect(result).not.toBeNull()
    if (result === null || result instanceof Error) return
    expect(result.hltbId).toBe(10)
  })

  it('returns null when no candidates', async () => {
    searchMock.mockResolvedValueOnce([])
    const result = await searchByName('Some Obscure Game')
    expect(result).toBeNull()
  })

  it('returns null when no candidate clears similarity threshold', async () => {
    searchMock.mockResolvedValueOnce([
      { id: '1', name: 'Completely Unrelated', gameplayMain: 1, gameplayMainExtra: 2, gameplayCompletionist: 3 },
    ])
    const result = await searchByName('Witcher 3')
    expect(result).toBeNull()
  })

  it('returns HltbRateLimitError on a 429 error message', async () => {
    searchMock.mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
    const result = await searchByName('Anything')
    expect(result).toBeInstanceOf(HltbRateLimitError)
  })

  it('returns HltbFetchError on other throws', async () => {
    searchMock.mockRejectedValueOnce(new Error('network down'))
    const result = await searchByName('Anything')
    expect(result).toBeInstanceOf(HltbFetchError)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
rtk pnpm test tests/lib/hltb/client.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// lib/hltb/client.ts
import { HowLongToBeatService } from 'howlongtobeat'
import { HltbRateLimitError, HltbFetchError } from '@/lib/errors'
import { pickBestMatch, type HltbCandidate } from '@/lib/hltb/matcher'
import type { HltbEntry } from '@/types/game'

const service = new HowLongToBeatService()

type RawHltbResult = {
  id: string | number
  name: string
  gameplayMain?: number
  gameplayMainExtra?: number
  gameplayCompletionist?: number
}

function toCandidate(r: RawHltbResult): HltbCandidate {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  return {
    id: Number(r.id),
    name: r.name,
    main: num(r.gameplayMain),
    mainExtra: num(r.gameplayMainExtra),
    completionist: num(r.gameplayCompletionist),
  }
}

export async function searchByName(name: string):
  Promise<HltbRateLimitError | HltbFetchError | HltbEntry | null>
{
  const results = await service.search(name).catch((e: unknown) => {
    const msg = String((e as { message?: unknown })?.message ?? '')
    if (/429/.test(msg)) return new HltbRateLimitError({ retryAfterMs: 10_000, cause: e as Error })
    return new HltbFetchError({ name, reason: 'search threw', cause: e as Error })
  })
  if (results instanceof Error) return results
  if (!Array.isArray(results) || results.length === 0) return null
  const candidates = (results as RawHltbResult[]).map(toCandidate)
  return pickBestMatch(candidates, name)
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
rtk pnpm test tests/lib/hltb/client.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/hltb/client.ts tests/lib/hltb/client.test.ts
git commit -m "feat(hltb): client adapter over howlongtobeat with tagged errors"
```

---

## Task 12: Upstash KV cache (`lib/cache/kv.ts`)

**Files:**
- Create: `lib/cache/kv.ts`
- Test: `tests/lib/cache/kv.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/lib/cache/kv.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KvError } from '@/lib/errors'

const getMock = vi.fn()
const setMock = vi.fn()

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      get = getMock
      set = setMock
    },
  }
})

beforeEach(() => { getMock.mockReset(); setMock.mockReset() })

import { getLibrary, setLibrary, getHltb, setHltb } from '@/lib/cache/kv'

describe('kv cache', () => {
  it('getLibrary returns null on cache miss', async () => {
    getMock.mockResolvedValueOnce(null)
    expect(await getLibrary('xx')).toBeNull()
  })

  it('getLibrary returns Cached payload on hit', async () => {
    getMock.mockResolvedValueOnce({ value: [], cachedAt: '2026-05-23T00:00:00Z' })
    const result = await getLibrary('xx')
    expect(result).not.toBeNull()
    expect(result).not.toBeInstanceOf(Error)
    if (!result || result instanceof Error) return
    expect(result.cachedAt).toBe('2026-05-23T00:00:00Z')
  })

  it('getLibrary returns KvError when redis throws', async () => {
    getMock.mockRejectedValueOnce(new Error('redis down'))
    const result = await getLibrary('xx')
    expect(result).toBeInstanceOf(KvError)
  })

  it('setLibrary writes with EX 3600', async () => {
    setMock.mockResolvedValueOnce('OK')
    const result = await setLibrary('xx', [])
    expect(result).toBeUndefined()
    expect(setMock).toHaveBeenCalledWith(
      'library:xx',
      expect.objectContaining({ value: [], cachedAt: expect.any(String) }),
      { ex: 3600 },
    )
  })

  it('setLibrary returns KvError on throw', async () => {
    setMock.mockRejectedValueOnce(new Error('boom'))
    const result = await setLibrary('xx', [])
    expect(result).toBeInstanceOf(KvError)
  })

  it('getHltb / setHltb use normalized name in key and 7d TTL', async () => {
    getMock.mockResolvedValueOnce(null)
    expect(await getHltb('Witcher 3')).toBeNull()
    expect(getMock).toHaveBeenCalledWith('hltb:witcher 3')

    setMock.mockResolvedValueOnce('OK')
    await setHltb('Witcher 3', null)
    expect(setMock).toHaveBeenCalledWith(
      'hltb:witcher 3',
      expect.objectContaining({ value: null }),
      { ex: 60 * 60 * 24 * 7 },
    )
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
rtk pnpm test tests/lib/cache/kv.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// lib/cache/kv.ts
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { KvError } from '@/lib/errors'
import { normalizeName } from '@/lib/hltb/matcher'
import type { Cached, SteamGame, HltbEntry } from '@/types/game'

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})

const LIBRARY_TTL_S = 60 * 60          // 1 hour
const HLTB_TTL_S    = 60 * 60 * 24 * 7 // 7 days

function libraryKey(steamId: string) { return `library:${steamId}` }
function hltbKey(name: string)       { return `hltb:${normalizeName(name)}` }

async function get<T>(key: string): Promise<KvError | Cached<T> | null> {
  const raw = await redis.get(key).catch(
    (e) => new KvError({ op: 'get', key, cause: e as Error }),
  )
  if (raw instanceof Error) return raw
  return (raw as Cached<T> | null) ?? null
}

async function setEx<T>(key: string, value: T, ttlSeconds: number): Promise<KvError | void> {
  const payload: Cached<T> = { value, cachedAt: new Date().toISOString() }
  const result = await redis.set(key, payload, { ex: ttlSeconds }).catch(
    (e) => new KvError({ op: 'set', key, cause: e as Error }),
  )
  if (result instanceof Error) return result
  return
}

export function getLibrary(steamId: string) {
  return get<SteamGame[]>(libraryKey(steamId))
}

export function setLibrary(steamId: string, games: SteamGame[]) {
  return setEx(libraryKey(steamId), games, LIBRARY_TTL_S)
}

export function getHltb(name: string) {
  return get<HltbEntry | null>(hltbKey(name))
}

export function setHltb(name: string, entry: HltbEntry | null) {
  return setEx(hltbKey(name), entry, HLTB_TTL_S)
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
rtk pnpm test tests/lib/cache/kv.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/cache/kv.ts tests/lib/cache/kv.test.ts
git commit -m "feat(cache): Upstash Redis adapter for library and hltb"
```

---

## Task 13: NextAuth + Steam OpenID

**Files:**
- Create: `auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `types/next-auth.d.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Create `auth.ts`**

```ts
// auth.ts
import NextAuth from 'next-auth'
import Steam, { PROVIDER_ID } from 'next-auth-steam'
import type { NextRequest } from 'next/server'

export const { handlers, auth, signIn, signOut } = NextAuth((req) => ({
  providers: [
    Steam(req as NextRequest, { clientSecret: process.env.STEAM_API_KEY! }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === PROVIDER_ID && profile) {
        token.steamId = (profile as { steamid?: string }).steamid
      }
      return token
    },
    async session({ session, token }) {
      if (typeof token.steamId === 'string') {
        session.user.steamId = token.steamId
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}))
```

- [ ] **Step 2: Create `types/next-auth.d.ts`**

```ts
// types/next-auth.d.ts
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      steamId?: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    steamId?: string
  }
}
```

- [ ] **Step 3: Create route handler**

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

- [ ] **Step 4: Create middleware**

```ts
// middleware.ts
export { auth as middleware } from '@/auth'

export const config = {
  matcher: ['/library/:path*'],
}
```

- [ ] **Step 5: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add auth.ts app/api/auth types/next-auth.d.ts middleware.ts
git commit -m "feat(auth): NextAuth v5 + Steam OpenID with steamId on session"
```

---

## Task 14: API route — `/api/library`

**Files:**
- Create: `app/api/library/route.ts`
- Create: `lib/http.ts` (small JSON helper)

- [ ] **Step 1: Create `lib/http.ts`**

```ts
// lib/http.ts
export function json<T extends object>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
```

- [ ] **Step 2: Create the route**

```ts
// app/api/library/route.ts
import * as errore from 'errore'
import { auth } from '@/auth'
import * as steam from '@/lib/steam/client'
import * as kv from '@/lib/cache/kv'
import { json } from '@/lib/http'
import {
  SteamPrivateProfileError,
  SteamUnavailableError,
} from '@/lib/errors'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const steamId = session.user.steamId
  const force = new URL(req.url).searchParams.get('force') === '1'

  if (!force) {
    const cached = await kv.getLibrary(steamId)
    if (cached instanceof Error) {
      console.warn('KV read failed:', cached.message)
    } else if (cached !== null) {
      return json(200, { games: cached.value, cachedAt: cached.cachedAt })
    }
  }

  const games = await steam.getOwnedGames(steamId)
  if (games instanceof Error) {
    return errore.matchError(games, {
      SteamPrivateProfileError: () => json(403, { error: 'private_profile' }),
      SteamUnavailableError:    () => json(502, { error: 'steam_unavailable' }),
      Error:                    () => json(500, { error: 'internal' }),
    })
  }

  const writeResult = await kv.setLibrary(steamId, games)
  if (writeResult instanceof Error) {
    console.warn('KV write failed:', writeResult.message)
  }

  return json(200, { games, cachedAt: null })
}
```

- [ ] **Step 3: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/library/route.ts lib/http.ts
git commit -m "feat(api): /api/library route with KV cache and force=1"
```

---

## Task 15: API route — `/api/hltb`

**Files:**
- Create: `app/api/hltb/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/hltb/route.ts
import pLimit from 'p-limit'
import { z } from 'zod'
import { auth } from '@/auth'
import * as hltb from '@/lib/hltb/client'
import * as kv from '@/lib/cache/kv'
import { json } from '@/lib/http'
import type { HltbEntry } from '@/types/game'

const bodySchema = z.object({
  games: z.array(z.object({ appid: z.number(), name: z.string() })).max(1000),
  force: z.boolean().optional(),
})

const limit = pLimit(5)

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(400, { error: 'invalid_body' })

  const { games, force } = parsed.data
  const entries: Record<number, HltbEntry | null> = {}
  const cachedAtPerEntry: Record<number, string | null> = {}

  await Promise.all(
    games.map((g) =>
      limit(async () => {
        if (!force) {
          const cached = await kv.getHltb(g.name)
          if (cached instanceof Error) {
            console.warn('KV read failed for', g.name, cached.message)
          } else if (cached !== null) {
            entries[g.appid] = cached.value
            cachedAtPerEntry[g.appid] = cached.cachedAt
            return
          }
        }

        const result = await hltb.searchByName(g.name)
        if (result instanceof Error) {
          console.warn('HLTB lookup failed for', g.name, result.message)
          entries[g.appid] = null
          cachedAtPerEntry[g.appid] = null
          return
        }
        entries[g.appid] = result
        cachedAtPerEntry[g.appid] = null

        const writeResult = await kv.setHltb(g.name, result)
        if (writeResult instanceof Error) {
          console.warn('KV write failed for', g.name, writeResult.message)
        }
      }),
    ),
  )

  return json(200, { entries, cachedAt: cachedAtPerEntry })
}
```

- [ ] **Step 2: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/hltb/route.ts
git commit -m "feat(api): /api/hltb batch route with KV cache and concurrency limit"
```

---

## Task 16: Client hooks (`hooks/use-library.ts`, `hooks/use-hltb.ts`)

**Files:**
- Create: `hooks/use-library.ts`
- Create: `hooks/use-hltb.ts`
- Create: `lib/client-fetch.ts`

- [ ] **Step 1: Create `lib/client-fetch.ts`**

```ts
// lib/client-fetch.ts
import { LibraryFetchError, HltbApiError } from '@/lib/errors'
import type { SteamGame, HltbEntry } from '@/types/game'

export async function fetchLibrary({ force }: { force: boolean }) {
  const url = `/api/library${force ? '?force=1' : ''}`
  const res = await fetch(url).catch(
    (e) => new LibraryFetchError({ status: 0, code: 'network', cause: e as Error }),
  )
  if (res instanceof Error) throw res

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new LibraryFetchError({ status: res.status, code: body?.error ?? 'unknown' })
  }
  return (await res.json()) as { games: SteamGame[]; cachedAt: string | null }
}

export async function fetchHltb({
  games,
  force,
}: {
  games: Array<{ appid: number; name: string }>
  force: boolean
}) {
  const res = await fetch('/api/hltb', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ games, force }),
  }).catch((e) => new HltbApiError({ status: 0, code: 'network', cause: e as Error }))
  if (res instanceof Error) throw res

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new HltbApiError({ status: res.status, code: body?.error ?? 'unknown' })
  }
  return (await res.json()) as {
    entries: Record<number, HltbEntry | null>
    cachedAt: Record<number, string | null>
  }
}
```

- [ ] **Step 2: Create `hooks/use-library.ts`**

```ts
// hooks/use-library.ts
'use client'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchLibrary } from '@/lib/client-fetch'

export const LIBRARY_QUERY_KEY = ['library'] as const

export function useLibrary() {
  return useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary({ force: false }),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

// Used by RefreshControls — overwrites the same cache entry with force=1
export async function refreshLibrary(qc: QueryClient) {
  await qc.fetchQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary({ force: true }),
    staleTime: 0,
  })
}
```

- [ ] **Step 3: Create `hooks/use-hltb.ts`**

```ts
// hooks/use-hltb.ts
'use client'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchHltb } from '@/lib/client-fetch'
import type { SteamGame } from '@/types/game'

export function hltbQueryKey(appids: number[]) {
  return ['hltb', appids] as const
}

export function useHltb({ games }: { games: SteamGame[] | undefined }) {
  const enabled = games !== undefined && games.length > 0
  const appids = games?.map((g) => g.appid) ?? []
  return useQuery({
    enabled,
    queryKey: hltbQueryKey(appids),
    queryFn: () =>
      fetchHltb({
        games: (games ?? []).map((g) => ({ appid: g.appid, name: g.name })),
        force: false,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export async function refreshHltb(qc: QueryClient, games: SteamGame[]) {
  await qc.fetchQuery({
    queryKey: hltbQueryKey(games.map((g) => g.appid)),
    queryFn: () =>
      fetchHltb({
        games: games.map((g) => ({ appid: g.appid, name: g.name })),
        force: true,
      }),
    staleTime: 0,
  })
}
```

- [ ] **Step 4: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add hooks lib/client-fetch.ts
git commit -m "feat(hooks): TanStack Query wrappers for library and hltb"
```

---

## Task 17: Query provider with localStorage persistence

**Files:**
- Create: `components/providers.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `components/providers.tsx`**

```tsx
// components/providers.tsx
'use client'
import { useState } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { SessionProvider } from 'next-auth/react'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 24 * 60 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  const persister =
    typeof window === 'undefined'
      ? undefined
      : createSyncStoragePersister({ storage: window.localStorage })

  return (
    <SessionProvider>
      {persister ? (
        <PersistQueryClientProvider
          client={client}
          persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
        >
          {children}
          <Toaster richColors position="top-right" />
        </PersistQueryClientProvider>
      ) : (
        <>
          {children}
          <Toaster richColors position="top-right" />
        </>
      )}
    </SessionProvider>
  )
}
```

- [ ] **Step 2: Wire providers into `app/layout.tsx`**

Open `app/layout.tsx` and wrap `<body>{children}</body>` with `<Providers>`:

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'

export const metadata: Metadata = { title: 'HLTB × Steam', description: 'Your Steam library with HowLongToBeat times' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/providers.tsx app/layout.tsx
git commit -m "feat(providers): QueryClient with localStorage persistor and Sonner"
```

---

## Task 18: Auth button + landing page

**Files:**
- Create: `components/auth-button.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create `components/auth-button.tsx`**

```tsx
// components/auth-button.tsx
'use client'
import { signIn, signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export function AuthButton() {
  const { data: session, status } = useSession()
  if (status === 'loading') return <Button disabled>Loading…</Button>
  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {session.user.name ?? session.user.steamId}
        </span>
        <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
      </div>
    )
  }
  return <Button onClick={() => signIn('steam')}>Sign in through Steam</Button>
}
```

- [ ] **Step 2: Replace `app/page.tsx`**

```tsx
// app/page.tsx
import Link from 'next/link'
import { auth } from '@/auth'
import { AuthButton } from '@/components/auth-button'
import { Button } from '@/components/ui/button'

export default async function HomePage() {
  const session = await auth()
  const signedIn = Boolean(session?.user?.steamId)

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">HLTB × Steam</h1>
      <p className="text-muted-foreground text-center">
        See your Steam library next to HowLongToBeat times. Filter and sort to find what fits your weekend.
      </p>
      <AuthButton />
      {signedIn ? (
        <Button asChild>
          <Link href="/library">Open my library →</Link>
        </Button>
      ) : null}
    </main>
  )
}
```

- [ ] **Step 3: Run dev server smoke-test**

```bash
rtk pnpm dev
```

Visit `http://localhost:3000/`. Expected: landing page renders, sign-in button visible.

Stop the dev server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add components/auth-button.tsx app/page.tsx
git commit -m "feat(page): landing page with Sign in through Steam"
```

---

## Task 19: Library filters component

**Files:**
- Create: `components/library-filters.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/library-filters.tsx
'use client'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'

export type LibraryFiltersValue = {
  query: string
  hltbRange: [number, number]
}

export function LibraryFilters({
  value,
  onChange,
  maxHours,
}: {
  value: LibraryFiltersValue
  onChange: (next: LibraryFiltersValue) => void
  maxHours: number
}) {
  const upperBound = Math.max(maxHours, 1)
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      <div className="flex-1">
        <label className="text-sm font-medium" htmlFor="search">Search</label>
        <Input
          id="search"
          placeholder="Filter by name…"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
        />
      </div>
      <div className="flex-1">
        <label className="text-sm font-medium" htmlFor="range">
          HLTB Main: {value.hltbRange[0]}h – {value.hltbRange[1]}h
        </label>
        <Slider
          id="range"
          min={0}
          max={upperBound}
          step={1}
          value={value.hltbRange}
          onValueChange={(v) =>
            onChange({ ...value, hltbRange: [v[0] ?? 0, v[1] ?? upperBound] })
          }
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/library-filters.tsx
git commit -m "feat(ui): library filters (search input + HLTB range slider)"
```

---

## Task 20: Refresh controls

**Files:**
- Create: `components/refresh-controls.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/refresh-controls.tsx
'use client'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'

export function RefreshControls({
  libraryCachedAt,
  hltbCachedAtMap,
  onRefreshLibrary,
  onRefreshHltb,
}: {
  libraryCachedAt: string | null
  hltbCachedAtMap: Record<number, string | null>
  onRefreshLibrary: () => Promise<void> | void
  onRefreshHltb: () => Promise<void> | void
}) {
  const [cooldown, setCooldown] = useState<'library' | 'hltb' | null>(null)

  async function withCooldown(key: 'library' | 'hltb', fn: () => Promise<void> | void) {
    setCooldown(key)
    await fn()
    setTimeout(() => setCooldown(null), 10_000)
  }

  // oldest hltb cachedAt (excluding nulls) — null entries are freshly fetched
  const hltbStamps = Object.values(hltbCachedAtMap).filter((s): s is string => s !== null)
  const oldestHltb = hltbStamps.length > 0 ? [...hltbStamps].sort()[0] : null

  const libraryAgo =
    libraryCachedAt === null ? 'just now' : `${formatDistanceToNow(new Date(libraryCachedAt))} ago`
  const hltbAgo =
    oldestHltb === null ? 'just now' : `${formatDistanceToNow(new Date(oldestHltb))} ago`

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-muted-foreground">
        Library updated: {libraryAgo} · HLTB cache: {hltbAgo}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={cooldown !== null}
          onClick={() => withCooldown('library', onRefreshLibrary)}
        >
          ↻ Refresh library
        </Button>
        <Button
          variant="outline"
          disabled={cooldown !== null}
          onClick={() => withCooldown('hltb', onRefreshHltb)}
        >
          ↻ Refresh HLTB
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/refresh-controls.tsx
git commit -m "feat(ui): refresh controls with timestamps and 10s cooldown"
```

---

## Task 21: Library table

**Files:**
- Create: `components/library-table.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/library-table.tsx
'use client'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import Image from 'next/image'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { GameRow } from '@/types/game'

function hours(minutes: number) { return (minutes / 60).toFixed(1) }
function hltbCell(v: number | null | undefined) {
  return v === null || v === undefined ? <span className="text-muted-foreground">—</span> : `${v}h`
}

const columns: ColumnDef<GameRow>[] = [
  {
    id: 'cover',
    header: '',
    cell: ({ row }) => (
      <Image
        src={row.original.headerImageUrl}
        alt={row.original.name}
        width={92}
        height={43}
        unoptimized
        className="rounded"
      />
    ),
    enableSorting: false,
  },
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    id: 'steamHours',
    header: 'Steam played',
    accessorFn: (r) => r.playtimeMinutes,
    cell: ({ row }) => `${hours(row.original.playtimeMinutes)}h`,
  },
  {
    id: 'hltbMain',
    header: 'HLTB Main',
    accessorFn: (r) => r.hltb?.mainHours ?? null,
    cell: ({ row }) => hltbCell(row.original.hltb?.mainHours ?? null),
    sortUndefined: 'last',
  },
  {
    id: 'hltbMainExtra',
    header: 'HLTB +Extra',
    accessorFn: (r) => r.hltb?.mainExtraHours ?? null,
    cell: ({ row }) => hltbCell(row.original.hltb?.mainExtraHours ?? null),
    sortUndefined: 'last',
  },
  {
    id: 'hltbCompletionist',
    header: 'HLTB 100%',
    accessorFn: (r) => r.hltb?.completionistHours ?? null,
    cell: ({ row }) => hltbCell(row.original.hltb?.completionistHours ?? null),
    sortUndefined: 'last',
  },
]

export function LibraryTable({ rows }: { rows: GameRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead
                key={h.id}
                onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                className={h.column.getCanSort() ? 'cursor-pointer select-none' : ''}
              >
                {flexRender(h.column.columnDef.header, h.getContext())}
                {h.column.getIsSorted() === 'asc' ? ' ▲' : h.column.getIsSorted() === 'desc' ? ' ▼' : ''}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Whitelist Steam CDN in `next.config.ts`**

```ts
// next.config.ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.cloudflare.steamstatic.com' },
    ],
  },
}

export default config
```

- [ ] **Step 3: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/library-table.tsx next.config.ts
git commit -m "feat(ui): library table with sortable columns and Steam covers"
```

---

## Task 22: Library page wiring

**Files:**
- Create: `app/library/page.tsx`
- Create: `app/library/library-screen.tsx`

- [ ] **Step 1: Create server entry that gates by auth**

```tsx
// app/library/page.tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { LibraryScreen } from './library-screen'

export default async function LibraryPage() {
  const session = await auth()
  if (!session?.user?.steamId) redirect('/')
  return <LibraryScreen />
}
```

- [ ] **Step 2: Create the client screen**

```tsx
// app/library/library-screen.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useLibrary, refreshLibrary } from '@/hooks/use-library'
import { useHltb, refreshHltb } from '@/hooks/use-hltb'
import { mergeGames } from '@/lib/library/merge'
import { searchByName, filterByHltbRange } from '@/lib/library/filters'
import { LibraryFilters, type LibraryFiltersValue } from '@/components/library-filters'
import { LibraryTable } from '@/components/library-table'
import { RefreshControls } from '@/components/refresh-controls'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthButton } from '@/components/auth-button'
import { LibraryFetchError } from '@/lib/errors'

export function LibraryScreen() {
  const qc = useQueryClient()
  const lib = useLibrary()
  const hltb = useHltb({ games: lib.data?.games })

  const rows = useMemo(() => {
    if (!lib.data) return []
    return mergeGames(lib.data.games, hltb.data?.entries ?? {})
  }, [lib.data, hltb.data])

  const maxHours = useMemo(() => {
    let m = 0
    for (const r of rows) {
      const v = r.hltb?.mainHours
      if (typeof v === 'number' && v > m) m = v
    }
    return m
  }, [rows])

  const [filters, setFilters] = useState<LibraryFiltersValue>({
    query: '',
    hltbRange: [0, 9999],
  })

  const visible = useMemo(() => {
    const searched = searchByName(rows, filters.query)
    if (filters.hltbRange[0] === 0 && filters.hltbRange[1] >= maxHours) return searched
    return filterByHltbRange(searched, filters.hltbRange[0], filters.hltbRange[1])
  }, [rows, filters, maxHours])

  const isPrivate =
    lib.error instanceof LibraryFetchError && lib.error.code === 'private_profile'

  useEffect(() => {
    if (lib.isError && lib.error && !isPrivate) {
      toast.error(`Failed to load library: ${(lib.error as Error).message}`)
    }
  }, [lib.isError, lib.error, isPrivate])

  useEffect(() => {
    if (hltb.isError && hltb.error) {
      toast.error(`HLTB fetch failed: ${(hltb.error as Error).message}`)
    }
  }, [hltb.isError, hltb.error])

  if (isPrivate) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card><CardContent className="space-y-2 pt-6">
          <h2 className="text-lg font-semibold">Your Steam profile is private</h2>
          <p className="text-sm text-muted-foreground">
            Open Steam → Profile → Edit Profile → Privacy Settings and set
            <strong> My profile</strong> and <strong>Game details</strong> to <strong>Public</strong>,
            then come back and refresh.
          </p>
          <AuthButton />
        </CardContent></Card>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Library</h1>
        <AuthButton />
      </header>
      <RefreshControls
        libraryCachedAt={lib.data?.cachedAt ?? null}
        hltbCachedAtMap={hltb.data?.cachedAt ?? {}}
        onRefreshLibrary={async () => {
          try {
            await refreshLibrary(qc)
          } catch (e) {
            const err = e as Error
            toast.error(`Refresh library failed: ${err.message}`)
          }
        }}
        onRefreshHltb={async () => {
          if (!lib.data?.games) return
          try {
            await refreshHltb(qc, lib.data.games)
          } catch (e) {
            const err = e as Error
            toast.error(`Refresh HLTB failed: ${err.message}`)
          }
        }}
      />
      <LibraryFilters value={filters} onChange={setFilters} maxHours={maxHours} />
      {lib.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <LibraryTable rows={visible} />
      )}
    </main>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/library
git commit -m "feat(library): wire library screen with table, filters, refresh, errors"
```

---

## Task 23: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# HLTB × Steam

A small Next.js app that signs you in through Steam, fetches your library,
enriches it with HowLongToBeat times, and lets you search, sort, and filter
by playtime estimates.

## Stack

- Next.js 16 (App Router) + TypeScript
- Auth.js v5 + Steam OpenID (`next-auth-steam`)
- Upstash Redis (server-side cache: library 1h, HLTB 7d)
- TanStack Query + Table v8
- shadcn/ui + Tailwind CSS
- errore (errors-as-values)
- Vitest

## Setup

```bash
cp .env.local.example .env.local
# Fill in:
#   STEAM_API_KEY               → https://steamcommunity.com/dev/apikey
#   NEXTAUTH_SECRET             → openssl rand -base64 32
#   UPSTASH_REDIS_REST_URL/TOKEN → Upstash console or `vercel env pull`

pnpm install
pnpm dev
```

Visit http://localhost:3000 and sign in.

> Your Steam profile and game details must be public for the library to load.

## Scripts

```bash
pnpm dev              # Next.js dev server (Turbopack)
pnpm build            # Production build
pnpm test             # Vitest unit tests
pnpm test:watch       # Watch mode
pnpm lint             # ESLint
```

## Architecture overview

See `docs/superpowers/specs/2026-05-23-hltb-steam-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: project README"
```

---

## Task 24: Full local verification

**Files:** none

- [ ] **Step 1: Run all tests**

```bash
rtk pnpm test
```

Expected: every test in `tests/` passes (errors, filters, matcher, merge, steam client, hltb client, kv).

- [ ] **Step 2: Type-check**

```bash
rtk pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
rtk pnpm build
```

Expected: build succeeds, no warnings about missing env at build time (env validation runs only when handlers execute).

- [ ] **Step 4: Manual smoke (requires real credentials in `.env.local`)**

```bash
rtk pnpm dev
```

1. Open `http://localhost:3000` → landing page renders.
2. Click "Sign in through Steam" → redirected to Steam OpenID, log in, return.
3. Click "Open my library" → table populates.
4. Wait a moment for HLTB columns to fill in.
5. Type in the search box → list filters live.
6. Click "HLTB Main" header → sort changes.
7. Adjust the slider → range filter applies.
8. Click "↻ Refresh library" → button disables for 10s, fresh data arrives, "Library updated: just now" appears.
9. Click "↻ Refresh HLTB" → same behaviour for HLTB columns.

Stop the server with Ctrl+C.

- [ ] **Step 5: Final commit (if any housekeeping)**

```bash
rtk git status
```

If clean, you're done. If anything is uncommitted, decide whether to commit or revert.

---

## Self-Review (author's notes)

**Spec coverage:**
- Goals: Steam login (T13), library fetch (T10, T14), HLTB enrichment (T11, T15), table view (T21), search (T7, T19, T22), sort by 5 fields (T7, T21), HLTB-range filter (T7, T19, T22), server cache (T12, T14, T15), manual refresh (T20, T22). All covered.
- Non-goals: no E2E, no Postgres, no Vercel deploy — none introduced.
- Tech stack: every package from the spec table is installed in T2 or generated via shadcn (T4).
- Error scenarios: every row in the spec's error table maps to a tagged error defined in T5 and either surfaced via toast (T22), banner (T22), or graceful degradation in `/api/hltb` (T15).

**Type consistency:** `SteamGame`, `HltbEntry`, `GameRow`, `Cached<T>`, `SortField`, `SortDirection` defined in T6 and used identically in T7–T22.

**No placeholders:** every step has actual code or an exact command; no "implement later".
