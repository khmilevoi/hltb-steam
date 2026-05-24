# HLTB Steam ID Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All shell commands should be prefixed with `rtk` per repo CLAUDE.md.

**Goal:** Resolve HLTB entries by shared Steam appid mappings first, then user-scoped fallback search names, with inline table editing for fallback names.

**Architecture:** Split HLTB enrichment into server-owned library loading, global mapping cache, HLTB entry cache by id, user override cache, and a resolver that applies the priority order from the spec. The client reads `/api/hltb` without sending games, merges `entries` and `meta` into rows, and uses `react-data-grid` edit support for the fallback search-name column.

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript, `unstorage` fs cache, `errore` errors-as-values, TanStack Query, `react-data-grid`, Vitest/jsdom.

---

## File Structure

- Create `lib/library/server.ts`
  - Shared server helper `loadUserLibrary({ steamId, force })` used by `/api/library` and `/api/hltb`.
- Modify `app/api/library/route.ts`
  - Thin route that delegates to `loadUserLibrary`.
- Modify `types/game.ts`
  - Add HLTB metadata/cache/API types and extend `GameRow` with `hltbMeta`.
- Modify `lib/cache/kv.ts`
  - Add mapping, entry-by-id, override, override-list, and snapshot helpers; expose a raw snapshot read that distinguishes missing vs expired.
- Modify `lib/hltb/client.ts`
  - Add HLTB Steam import and detail-by-HLTB-id functions while keeping `searchByName`.
- Create `lib/hltb/meta.ts`
  - Single source of truth for the `getHltbSearchName(meta)` selector shared by server resolver tests and UI cells.
- Create `lib/hltb/resolve.ts`
  - Pure-ish server resolver that orchestrates mapping-first lookup, snapshot-gated import, and fallback name search.
- Replace `app/api/hltb/route.ts`
  - Convert from `POST { games }` to `GET /api/hltb?force=0|1`.
- Create `app/api/hltb/[appid]/route.ts`
  - One-row `GET` response for the current user's library game.
- Create `app/api/hltb/overrides/[appid]/route.ts`
  - `PUT` create/update/delete one override.
- Modify `lib/client-fetch.ts`
  - Update HLTB fetchers and add override API helper.
- Modify `hooks/use-hltb.ts`
  - Remove `games` request body, key the query by `['hltb']`, add row refresh/override helpers, return fresh games from `refreshLibrary`.
- Modify `lib/library/merge.ts`
  - Merge HLTB `entries` and `meta` into `GameRow`. Missing meta stays as `hltbMeta: null` (not synthesized to `source: 'none'`).
- Modify `app/library/library-screen.tsx`
  - Pass HLTB metadata and override-save handler into the table.
- Modify `components/library-table/library-table.tsx`
  - Add `onRowsChange` bridge for editable HLTB search-name cells (optional prop, no-op default).
- Modify `components/library-table/use-library-columns.tsx`
  - Add editable HLTB search-name column using `renderEditCell` and `editable(row)`.
- Create `components/library-table/cells/hltb-search-name-cell.tsx`
  - Read display cell renderer for fallback search names and reset control.
- Create `components/library-table/cells/hltb-search-name-editor.tsx`
  - Inline editor component with local draft state; calls `onCommit(row, value)` directly (no `hltbSearchNameDraft` field on `GameRow`).
- Modify `components/library-table/types.ts`
  - Add sortable key if the new column should sort, or explicitly keep it unsortable.
- Add/modify tests under `tests/lib/**`, `tests/app/api/**`, and `tests/components/**` as described below.

Route layout note: keep `app/api/hltb/overrides/...` as a literal route folder and `app/api/hltb/[appid]/route.ts` as the dynamic route. Validate `[appid]` as a positive integer so `/api/hltb/overrides` can never be treated as a valid appid.

There is **no** `GET /api/hltb/overrides` route in this plan — overrides are exposed exclusively through `meta[appid].overrideName` in the main HLTB response. Add a list route later if/when an admin/management surface needs one.

## Shared Decisions

- Library snapshot TTL: `12 * 60 * 60 * 1000` (12 hours). Constant lives in `lib/cache/kv.ts` as `HLTB_SNAPSHOT_TTL_MS` to avoid clashing with the existing `LIBRARY_TTL_MS` for Steam library cache.
- `GET /api/hltb/:appid` response shape:

```ts
type HltbSingleResponse = {
  entry: HltbEntry | null
  cachedAt: string | null
  meta: HltbMeta
}
```

- `GET /api/hltb` response remains appid-keyed:

```ts
type HltbResponse = {
  entries: Record<number, HltbEntry | null>
  cachedAt: Record<number, string | null>
  meta: Record<number, HltbMeta>
}
```

- `PUT /api/hltb/overrides/:appid` responds with `204 No Content` on success (create, update, or delete). Validation errors return `400`, missing library row → `404`, conflict with global mapping → `409 { error: 'mapping_exists' }`.
- HLTB UI selector lives in `lib/hltb/meta.ts`:

```ts
// lib/hltb/meta.ts
import type { HltbMeta } from '@/types/game'

export function getHltbSearchName(meta: HltbMeta): string {
  return meta.overrideName ?? meta.steamName
}
```

Both the cell component and any server tests import `getHltbSearchName` from here.

- TanStack Query key is `['hltb'] as const`. The server owns library loading by `steamId`, so the client doesn't need to encode appids into the query key. This also keeps `setQueriesData({ queryKey: ['hltb'] }, …)` targeted.

---

### Task 1: Extract Shared Server Library Loader

**Files:**
- Create: `lib/library/server.ts`
- Modify: `app/api/library/route.ts`
- Test: `tests/lib/library/server.test.ts`

- [ ] **Step 1: Write failing tests for `loadUserLibrary`**

Create `tests/lib/library/server.test.ts` with mocked `@/lib/cache/kv` and `@/lib/steam/client`.

Cover:
- returns cached library when `force=false` and cache hit exists;
- fetches Steam and writes cache on cache miss;
- bypasses cache read when `force=true`;
- returns Steam errors as values;
- logs and continues on KV read/write errors.

Representative test:

```ts
it('returns cached library when force is false', async () => {
  getLibraryMock.mockResolvedValueOnce({
    value: [{ appid: 1, name: 'Portal', playtimeMinutes: 60, headerImageUrl: 'portal.jpg' }],
    cachedAt: '2026-05-24T00:00:00.000Z',
  })

  const result = await loadUserLibrary({ steamId: 'steam-1', force: false })

  expect(result).toEqual({
    games: [{ appid: 1, name: 'Portal', playtimeMinutes: 60, headerImageUrl: 'portal.jpg' }],
    cachedAt: '2026-05-24T00:00:00.000Z',
  })
  expect(getOwnedGamesMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run failing test**

Run: `rtk pnpm vitest run tests/lib/library/server.test.ts`

Expected: FAIL because `@/lib/library/server` does not exist.

- [ ] **Step 3: Implement `loadUserLibrary`**

Create `lib/library/server.ts`:

```ts
import * as kv from '@/lib/cache/kv'
import * as steam from '@/lib/steam/client'
import type { Cached, SteamGame } from '@/types/game'

export type LoadUserLibraryResult =
  | { games: SteamGame[]; cachedAt: string | null }
  | Error

export async function loadUserLibrary({
  force,
  steamId,
}: {
  steamId: string
  force: boolean
}): Promise<LoadUserLibraryResult> {
  if (!force) {
    const cached = await kv.getLibrary(steamId)
    if (cached instanceof Error) {
      console.warn('KV read failed:', cached.message)
    } else if (cached !== null) {
      return { games: cached.value, cachedAt: cached.cachedAt }
    }
  }

  const games = await steam.getOwnedGames(steamId)
  if (games instanceof Error) return games

  const writeResult = await kv.setLibrary(steamId, games)
  if (writeResult instanceof Error) {
    console.warn('KV write failed:', writeResult.message)
  }

  return { games, cachedAt: null }
}
```

- [ ] **Step 4: Update `/api/library` to delegate**

Modify `app/api/library/route.ts` to call `loadUserLibrary` and keep the same HTTP error mapping.

Expected shape:

```ts
const result = await loadUserLibrary({ steamId, force })
if (result instanceof Error) {
  return errore.matchError(result, {
    SteamPrivateProfileError: () => json(403, { error: 'private_profile' }),
    SteamUnavailableError: () => json(502, { error: 'steam_unavailable' }),
    Error: () => json(500, { error: 'internal' }),
  })
}
return json(200, { games: result.games, cachedAt: result.cachedAt })
```

- [ ] **Step 5: Verify**

Run:

```bash
rtk pnpm vitest run tests/lib/library/server.test.ts
rtk pnpm vitest run tests/lib/steam/client.test.ts tests/components/library-screen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add lib/library/server.ts app/api/library/route.ts tests/lib/library/server.test.ts
rtk git commit -m "refactor: share server library loader"
```

---

### Task 2: Add HLTB Mapping, Override, Snapshot Types And KV Helpers

**Files:**
- Modify: `types/game.ts`
- Modify: `lib/cache/kv.ts`
- Create: `lib/hltb/meta.ts`
- Test: `tests/lib/cache/kv.test.ts`

- [ ] **Step 1: Write failing KV tests**

Extend `tests/lib/cache/kv.test.ts` for:
- `getHltbMapping` / `setHltbMapping` use `hltb-map:steam-app:{appid}`;
- `getHltbEntryById` / `setHltbEntryById` use `hltb-entry:hltb-id:{hltbId}` with 7 day TTL;
- `getHltbOverrideName` / `setHltbOverrideName` / `deleteHltbOverrideName` use `hltb-override-name:{steamId}:{appid}`;
- `getHltbOverrideNames` lists user overrides using `storage.getKeys`;
- `setHltbLibrarySnapshot` writes `hltb-library-snapshot:{steamId}`;
- `getHltbLibrarySnapshot(steamId)` returns the raw `Cached<HltbLibrarySnapshot>` without TTL filtering so callers can distinguish missing (`null`) from expired (non-null but stale `cachedAt`).

Representative key assertion:

```ts
await setHltbMapping({
  steamAppId: 620,
  hltbId: 7230,
  hltbName: 'Portal',
  discoveredFromSteamId: 'steam-1',
  discoveredAt: '2026-05-24T00:00:00.000Z',
})

expect(setItemMock).toHaveBeenCalledWith(
  'hltb-map:steam-app:620',
  expect.objectContaining({
    value: expect.objectContaining({ steamAppId: 620, hltbId: 7230 }),
  }),
)
```

Representative snapshot raw-read assertion:

```ts
it('returns expired snapshot without filtering', async () => {
  const stale = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  getItemMock.mockResolvedValueOnce({
    value: { appids: [1], refreshedAt: stale },
    cachedAt: stale,
  })

  const result = await getHltbLibrarySnapshot('steam-1')

  expect(result).toEqual({
    value: { appids: [1], refreshedAt: stale },
    cachedAt: stale,
  })
})
```

- [ ] **Step 2: Run failing tests**

Run: `rtk pnpm vitest run tests/lib/cache/kv.test.ts`

Expected: FAIL because helpers/types do not exist and mocked storage lacks `getKeys`.

- [ ] **Step 3: Add types**

Modify `types/game.ts`:

```ts
export type HltbSource = 'steam-import' | 'override-name' | 'steam-name' | 'none'

export type HltbMeta = {
  source: HltbSource
  steamName: string
  overrideName: string | null
}

export type HltbResponse = {
  entries: Record<number, HltbEntry | null>
  cachedAt: Record<number, string | null>
  meta: Record<number, HltbMeta>
}

export type HltbSingleResponse = {
  entry: HltbEntry | null
  cachedAt: string | null
  meta: HltbMeta
}

export type HltbSteamMapping = {
  steamAppId: number
  hltbId: number
  hltbName: string
  discoveredFromSteamId: string
  discoveredAt: string
}

export type HltbOverrideName = {
  appid: number
  searchName: string
  updatedAt: string
}

export type HltbLibrarySnapshot = {
  appids: number[]
  refreshedAt: string
}

export type GameRow = SteamGame & {
  hltb: HltbEntry | null
  hltbMeta: HltbMeta | null
}
```

- [ ] **Step 4: Add KV helpers**

Modify `lib/cache/kv.ts`.

Add constants:

```ts
const HLTB_SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000
```

Add key helpers and exported functions:

```ts
function hltbMappingKey(appid: number) {
  return `hltb-map:steam-app:${appid}`
}

function hltbEntryByIdKey(hltbId: number) {
  return `hltb-entry:hltb-id:${hltbId}`
}

function hltbOverrideNameKey(steamId: string, appid: number) {
  return `hltb-override-name:${steamId}:${appid}`
}

function hltbOverrideNamePrefix(steamId: string) {
  return `hltb-override-name:${steamId}:`
}

function hltbLibrarySnapshotKey(steamId: string) {
  return `hltb-library-snapshot:${steamId}`
}
```

Add wrappers used by the new helpers:
- `remove(key)` over `storage.removeItem` with `KvError`;
- `getKeys(base)` over `storage.getKeys(base)` with `KvError`;
- `getRaw<T>(key)` that returns `Cached<T> | null | KvError` **without** TTL filtering. The resolver uses this for the snapshot so it can distinguish missing (`null`) from expired (non-null but stale `cachedAt`). All other reads continue to use the TTL-filtering `get<T>`.

Important behavior:
- `setHltbOverrideName` trims before write.
- `deleteHltbOverrideName` removes key.
- `getHltbOverrideNames(steamId)` returns `Record<number, string>` and ignores malformed keys/values.
- `getHltbLibrarySnapshot(steamId)` uses `getRaw<HltbLibrarySnapshot>` and exports `HLTB_SNAPSHOT_TTL_MS` (or an `isHltbSnapshotExpired(cachedAt)` helper) so the resolver applies expiry centrally.
- Keep existing `getHltb` / `setHltb` temporarily for compatibility until resolver migration is complete. Removal is tracked by Task 9.

- [ ] **Step 5: Add `getHltbSearchName` helper**

Create `lib/hltb/meta.ts`:

```ts
import type { HltbMeta } from '@/types/game'

export function getHltbSearchName(meta: HltbMeta): string {
  return meta.overrideName ?? meta.steamName
}
```

Only one definition lives in the repo; the cell component and any other consumer imports from here.

- [ ] **Step 6: Verify**

Run:

```bash
rtk pnpm vitest run tests/lib/cache/kv.test.ts
rtk pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add types/game.ts lib/cache/kv.ts lib/hltb/meta.ts tests/lib/cache/kv.test.ts
rtk git commit -m "feat: add HLTB mapping cache primitives"
```

---

### Task 3: Add HLTB Steam Import And Detail-By-ID Client Functions

**Files:**
- Modify: `lib/hltb/client.ts`
- Test: `tests/lib/hltb/client.test.ts`

- [ ] **Step 1: Write failing HLTB client tests**

Add tests for:
- `fetchSteamImport(steamId)` posts to `/api/steam/getSteamImportData`;
- returns `HltbFetchError` when import response has `error`;
- filters invalid import rows;
- `fetchById(hltbId)` fetches Next data endpoint and maps details to `HltbEntry`;
- `fetchById` returns `HltbFetchError` on malformed data;
- `fetchById` returns `HltbRateLimitError` when the underlying response is `429` (the shared `readJson` already produces this; the test guarantees the contract is preserved end-to-end).

Representative import test:

```ts
fetchMock.mockResolvedValueOnce(
  Response.json({
    games: [
      {
        steam_id: 620,
        hltb_id: 7230,
        hltb_name: 'Portal',
        hltb_time: 10800,
      },
    ],
  }),
)

const result = await fetchSteamImport('steam-1')

expect(result).toEqual([
  { steamAppId: 620, hltbId: 7230, hltbName: 'Portal' },
])
```

Representative rate-limit test:

```ts
fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))

const result = await fetchById(7230)

expect(result).toBeInstanceOf(HltbRateLimitError)
```

- [ ] **Step 2: Run failing tests**

Run: `rtk pnpm vitest run tests/lib/hltb/client.test.ts`

Expected: FAIL because functions do not exist.

- [ ] **Step 3: Refactor shared conversion**

In `lib/hltb/client.ts`, extract raw result mapping:

```ts
function toEntry(result: RawHltbResult): HltbEntry {
  const candidate = toCandidate(result)
  return {
    mainHours: candidate.main,
    mainExtraHours: candidate.mainExtra,
    completionistHours: candidate.completionist,
    hltbId: candidate.id,
    matchedName: candidate.name,
  }
}
```

Keep `searchByName` using `pickBestMatch`.

- [ ] **Step 4: Implement `fetchSteamImport`**

Add:

```ts
export type HltbSteamImportGame = {
  steamAppId: number
  hltbId: number
  hltbName: string
}

export async function fetchSteamImport(
  steamId: string,
): Promise<HltbFetchError | HltbSteamImportGame[]> {
  // POST https://howlongtobeat.com/api/steam/getSteamImportData
}
```

Implementation notes:
- body: `{ steamUserId: steamId, steamOmitData: 0 }`;
- headers: `Content-Type`, `User-Agent`, `Referer`;
- `data.error` becomes `HltbFetchError({ name: 'HLTB Steam import', reason: String(data.error) })`;
- return only rows where `steam_id` and `hltb_id` are finite positive numbers and `hltb_name` is a string.

- [ ] **Step 5: Implement `fetchById`**

Reuse the existing `readJson` so the `HltbRateLimitError` and `HltbFetchError` channels behave identically to `searchByName`.

Use the current HLTB page as source of the Next build id:

```ts
async function fetchBuildId(): Promise<string | HltbFetchError> {
  const response = await fetch(HLTB_BASE_URL, { cache: 'no-store', headers: baseHeaders })
  const html = await response.text()
  const match = html.match(/"buildId":"([^"]+)"/)
  if (!match) return new HltbFetchError({ name: 'HLTB', reason: 'missing build id' })
  return match[1]
}
```

Then:

```ts
export async function fetchById(
  hltbId: number,
): Promise<HltbFetchError | HltbRateLimitError | HltbEntry | null> {
  const buildId = await fetchBuildId()
  if (buildId instanceof Error) return buildId

  const response = await fetch(`${HLTB_BASE_URL}/_next/data/${buildId}/game/${hltbId}.json`, {
    cache: 'no-store',
    headers: baseHeaders,
  })
  const data = await readJson<NextGameResponse>(response)
  if (data instanceof Error) return data
  // Extract pageProps.game.data.game[0], return toEntry(raw)
}
```

Keep parsing defensive; return `null` only for valid "not found" empty game arrays, otherwise `HltbFetchError`.

- [ ] **Step 6: Verify**

Run:

```bash
rtk pnpm vitest run tests/lib/hltb/client.test.ts
rtk pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add lib/hltb/client.ts tests/lib/hltb/client.test.ts
rtk git commit -m "feat: add HLTB import and id lookup client"
```

---

### Task 4: Implement HLTB Resolver

**Files:**
- Create: `lib/hltb/resolve.ts`
- Test: `tests/lib/hltb/resolve.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Mock `@/lib/cache/kv` and `@/lib/hltb/client`.

Cover:
- all appids mapped: skips Steam import;
- unmapped + missing snapshot: calls import, writes mappings, rechecks mapping;
- unmapped + expired snapshot (non-null `cachedAt`, stale): calls import;
- unmapped + fresh snapshot missing at least one unmapped appid: calls import;
- unmapped + fresh snapshot covering appids: skips import and uses fallback search;
- global mapping wins over override;
- override wins over Steam name without mapping;
- Steam name used when no override;
- `force=true` bypasses both HLTB entry cache (`getHltbEntryById`) reads and name-search cache (`getHltb`) reads but still uses mapping/snapshot policy and still writes back to those caches;
- detail-by-id failure returns `null` with `source: 'steam-import'`;
- detail-by-id `HltbRateLimitError` is logged and treated like failure (returns `null`, keeps mapping);
- fallback miss returns `source: 'none'` with `steamName` and `overrideName`;
- direct-mapped rows always return `overrideName: null` even when a dormant override exists in KV (we don't delete it; spec section 4 allows opportunistic cleanup but lookup correctness must not depend on it).

Representative priority test:

```ts
it('uses override name before Steam name when no mapping exists', async () => {
  getHltbMappingMock.mockResolvedValueOnce(null)
  getHltbLibrarySnapshotMock.mockResolvedValueOnce({
    value: { appids: [1], refreshedAt: new Date().toISOString() },
    cachedAt: new Date().toISOString(),
  })
  getHltbOverrideNameMock.mockResolvedValueOnce({
    value: { appid: 1, searchName: 'Portal 2007', updatedAt: new Date().toISOString() },
    cachedAt: new Date().toISOString(),
  })
  searchByNameMock.mockResolvedValueOnce(portalEntry)

  const result = await resolveHltbForLibrary({
    force: false,
    games: [{ appid: 1, name: 'Portal', playtimeMinutes: 0, headerImageUrl: '' }],
    steamId: 'steam-1',
  })

  expect(searchByNameMock).toHaveBeenCalledWith('Portal 2007')
  expect(result.meta[1]).toEqual({
    source: 'override-name',
    steamName: 'Portal',
    overrideName: 'Portal 2007',
  })
})
```

- [ ] **Step 2: Run failing tests**

Run: `rtk pnpm vitest run tests/lib/hltb/resolve.test.ts`

Expected: FAIL because resolver does not exist.

- [ ] **Step 3: Implement resolver types and constants**

Create `lib/hltb/resolve.ts`:

```ts
import pLimit from 'p-limit'
import * as kv from '@/lib/cache/kv'
import * as hltb from '@/lib/hltb/client'
import type { HltbEntry, HltbMeta, HltbResponse, HltbSingleResponse, SteamGame } from '@/types/game'

const limit = pLimit(5)

export async function resolveHltbForLibrary({
  force,
  games,
  steamId,
}: {
  steamId: string
  games: SteamGame[]
  force: boolean
}): Promise<HltbResponse> {
  // implementation
}

export async function resolveHltbForGame(args: {
  steamId: string
  game: SteamGame
  force: boolean
}): Promise<HltbSingleResponse> {
  // call resolveHltbForLibrary for one game, unwrap keyed maps
}
```

- [ ] **Step 4: Implement mapping-first import policy**

Algorithm:

1. Read mappings for all `games`.
2. Compute `unmappedAppids`.
3. If `unmappedAppids.length > 0`, read snapshot via `kv.getHltbLibrarySnapshot(steamId)` (raw — no TTL filter).
4. Decide import:
   - missing snapshot (`null`) → import;
   - expired snapshot (non-null with `isExpired(cachedAt, HLTB_SNAPSHOT_TTL_MS)`) → import;
   - fresh snapshot but at least one `unmappedAppids` is absent → import;
   - otherwise → skip import.
5. On import success:
   - write each mapping via `setHltbMapping`;
   - update snapshot via `setHltbLibrarySnapshot(steamId, currentAppids)`;
   - re-read mappings for previously unmapped appids.
6. On import failure:
   - log warning;
   - do not update snapshot.

Do not let KV failures throw out of resolver. Distinguish missing vs expired in log messages only — both still trigger import.

- [ ] **Step 5: Implement per-game resolution**

For each game under `p-limit(5)`:

```ts
if (mapping exists) {
  if (!force) read kv.getHltbEntryById(mapping.hltbId)
  if cache miss or force, call hltb.fetchById(mapping.hltbId), then kv.setHltbEntryById
  return source 'steam-import', overrideName null   // explicit: ignore any dormant KV override
}

const override = await kv.getHltbOverrideName(steamId, game.appid)
const searchName = override?.value.searchName ?? game.name
const source = override ? 'override-name' : 'steam-name'

// force wiring for name-search compatibility cache:
let cachedEntry: HltbEntry | null | undefined
if (!force) {
  const cached = await kv.getHltb(searchName)
  if (cached instanceof Error) {
    console.warn('KV read failed for', searchName, cached.message)
  } else if (cached !== null) {
    cachedEntry = cached.value
  }
}

const result = cachedEntry !== undefined ? cachedEntry : await hltb.searchByName(searchName)
if (result instanceof Error) {
  // includes HltbRateLimitError — log and treat as miss
  console.warn('HLTB search failed for', searchName, result.message)
  return null with source 'none'
}

// write back to name cache regardless of force (refreshes timestamp on force=true)
await kv.setHltb(searchName, result)

if (result === null) return null with source 'none'
return result with source
```

Name-search fallback continues using existing `getHltb(name)` / `setHltb(name)` as a compatibility cache only. Do not write into the global mapping cache from name search — removal of this compat layer is tracked by Task 9.

- [ ] **Step 6: Verify**

Run:

```bash
rtk pnpm vitest run tests/lib/hltb/resolve.test.ts
rtk pnpm vitest run tests/lib/hltb/client.test.ts tests/lib/cache/kv.test.ts
rtk pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add lib/hltb/resolve.ts tests/lib/hltb/resolve.test.ts
rtk git commit -m "feat: resolve HLTB data by Steam app mappings"
```

---

### Task 5: Replace HLTB Stack End-to-End (Routes, Client, Merge)

> **Atomic delivery.** This task replaces `POST /api/hltb { games }` with server-owned `GET /api/hltb`, updates the client fetchers and hook to match, and teaches `mergeGames` about `meta`. These changes are interdependent — committing route changes without the client update breaks `/library` with a 405. The plan deliberately ships them as one commit. Subtasks below should be implemented and tested together; only the final Step verifies and commits.

**Files:**
- Modify: `app/api/hltb/route.ts`
- Create: `app/api/hltb/[appid]/route.ts`
- Create: `app/api/hltb/overrides/[appid]/route.ts`
- Modify: `lib/client-fetch.ts`
- Modify: `hooks/use-hltb.ts`
- Modify: `lib/library/merge.ts`
- Modify: `app/library/library-screen.tsx`
- Test: `tests/app/api/hltb/route.test.ts`
- Test: `tests/app/api/hltb/appid-route.test.ts`
- Test: `tests/app/api/hltb/overrides-route.test.ts`
- Test: `tests/lib/library/merge.test.ts`
- Test: `tests/components/library-screen.test.tsx`

- [ ] **Step 1: Write failing route tests**

Mock:
- `@/auth`;
- `@/lib/library/server`;
- `@/lib/hltb/resolve`;
- `@/lib/cache/kv`.

Cover:
- `GET /api/hltb` returns 401 without session;
- `GET /api/hltb` loads library server-side via `loadUserLibrary({ force: false })` and calls resolver;
- `GET /api/hltb?force=1` still calls `loadUserLibrary({ force: false })` (HLTB force does not force Steam library) and resolver with `force: true`;
- `GET /api/hltb/[appid]` returns `400` for non-positive/non-numeric appid;
- `GET /api/hltb/[appid]` returns `404` when appid is not in the user's current Steam library (load library via `loadUserLibrary({ force: false })` and look up by appid);
- `PUT /api/hltb/overrides/[appid]` returns `400` for invalid JSON or invalid body shape (validate before library/mapping lookups);
- `PUT /api/hltb/overrides/[appid]` returns `404` when appid is not in the current library;
- `PUT /api/hltb/overrides/[appid]` returns `409 { error: 'mapping_exists' }` when a global mapping exists;
- `PUT /api/hltb/overrides/[appid]` returns `204` after creating, updating, or deleting an override (blank or Steam-name-equivalent body deletes);
- there is no `GET /api/hltb/overrides` route in this iteration (overrides are exposed through `meta[appid].overrideName`).

- [ ] **Step 2: Write failing merge + client tests**

Update `tests/lib/library/merge.test.ts`:

```ts
const rows = mergeGames(games, entries, meta)
expect(rows[0].hltbMeta).toEqual({
  source: 'steam-import',
  steamName: 'Portal',
  overrideName: null,
})
```

Also test missing metadata stays as `null`:

```ts
const rows = mergeGames([{ appid: 9, name: 'Foo', ... }], {}, {})
expect(rows[0].hltbMeta).toBeNull()
```

If extending `tests/hooks/use-hltb.test.ts` or `tests/components/library-screen.test.tsx`, verify:
- `fetchHltb({ force: false })` calls `GET /api/hltb`;
- `fetchHltb({ force: true })` calls `GET /api/hltb?force=1`;
- `fetchHltbGame({ appid })` calls `GET /api/hltb/{appid}`;
- `putHltbOverrideName({ appid, searchName })` calls `PUT /api/hltb/overrides/{appid}`;
- `useHltb` keys its query by `['hltb']` (constant) and refetches on session change rather than appids.

- [ ] **Step 3: Run failing tests**

Run:

```bash
rtk pnpm vitest run tests/app/api/hltb/route.test.ts tests/app/api/hltb/appid-route.test.ts tests/app/api/hltb/overrides-route.test.ts tests/lib/library/merge.test.ts tests/components/library-screen.test.tsx
```

Expected: FAIL — routes/helpers don't exist, old route is POST-only, merge doesn't accept meta.

- [ ] **Step 4: Replace `app/api/hltb/route.ts`**

Implementation shape:

```ts
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const hltbForce = new URL(req.url).searchParams.get('force') === '1'
  const library = await loadUserLibrary({ steamId: session.user.steamId, force: false })
  if (library instanceof Error) return mapLibraryError(library)

  const result = await resolveHltbForLibrary({
    steamId: session.user.steamId,
    games: library.games,
    force: hltbForce,
  })

  return json(200, result)
}
```

Remove the old `POST` handler. The combined atomic commit ensures clients are also updated.

- [ ] **Step 5: Add `GET /api/hltb/[appid]`**

Use route signature compatible with Next 16 route handlers:

```ts
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appid: string }> },
) {
  const { appid } = await params
  // 1. validate positive integer → 400
  // 2. auth → 401
  // 3. loadUserLibrary({ force: false })
  // 4. find game in library → 404 if missing
  // 5. resolveHltbForGame({ steamId, game, force: query.force === '1' })
}
```

Return `HltbSingleResponse`.

- [ ] **Step 6: Add `PUT /api/hltb/overrides/[appid]`**

`app/api/hltb/overrides/[appid]/route.ts`:

1. `auth()` → 401 if missing;
2. parse body `{ searchName: string | null }` → 400 on invalid JSON / wrong shape;
3. validate appid positive integer → 400;
4. `loadUserLibrary({ force: false })`; 404 if appid not in library;
5. `getHltbMapping(appid)` → 409 `{ error: 'mapping_exists' }` if mapping exists;
6. delete override when body is `null`, blank-after-trim, or trimmed value equals the original Steam name;
7. otherwise store trimmed override;
8. respond `204 No Content`.

- [ ] **Step 7: Update `mergeGames`**

Modify signature:

```ts
export function mergeGames(
  games: SteamGame[],
  hltbEntries: Record<number, HltbEntry | null>,
  hltbMeta: Record<number, HltbMeta> = {},
): GameRow[] {
  return games.map((game) => ({
    ...game,
    hltb: hltbEntries[game.appid] ?? null,
    hltbMeta: hltbMeta[game.appid] ?? null,
  }))
}
```

Missing metadata stays `null` — do **not** synthesize a `source: 'none'` row, because `'none'` means "search attempted and missed" per spec. UI cell already handles `meta === null` as a placeholder.

- [ ] **Step 8: Modify `lib/client-fetch.ts`**

```ts
export async function fetchHltb({ force }: { force: boolean }) {
  const res = await fetch(`/api/hltb${force ? '?force=1' : ''}`).catch(/* … */)
  // return HltbResponse
}

export async function fetchHltbGame({ appid }: { appid: number }) {
  const res = await fetch(`/api/hltb/${appid}`).catch(/* … */)
  // return HltbSingleResponse
}

export async function putHltbOverrideName({
  appid,
  searchName,
}: {
  appid: number
  searchName: string | null
}) {
  const res = await fetch(`/api/hltb/overrides/${appid}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ searchName }),
  }).catch(/* … */)
  // expect 204; throw on non-2xx
}
```

- [ ] **Step 9: Modify `hooks/use-hltb.ts`**

Switch the query key to a constant:

```ts
export const HLTB_QUERY_KEY = ['hltb'] as const

export function useHltb({ enabled }: { enabled: boolean }) {
  return useQuery({
    enabled,
    queryKey: HLTB_QUERY_KEY,
    queryFn: () => fetchHltb({ force: false }),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export async function refreshHltb(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: HLTB_QUERY_KEY,
    queryFn: () => fetchHltb({ force: true }),
    staleTime: 0,
  })
}

export async function saveHltbOverrideAndRefresh({
  appid,
  queryClient,
  searchName,
}: {
  appid: number
  queryClient: QueryClient
  searchName: string | null
}) {
  await putHltbOverrideName({ appid, searchName })
  const single = await fetchHltbGame({ appid })
  queryClient.setQueryData(HLTB_QUERY_KEY, (old: HltbResponse | undefined) =>
    mergeSingleHltbResult(old, appid, single),
  )
}
```

`mergeSingleHltbResult` is a small pure helper that splats the single response into the keyed maps; cover it with a unit test if implementation grows.

Also extend `refreshLibrary` (in the library hook) to return the fresh `games` array so callers can act on a guaranteed-current list without reading stale `library.data`:

```ts
export async function refreshLibrary(queryClient: QueryClient): Promise<SteamGame[]> {
  const data = await queryClient.fetchQuery({ /* … */ })
  return data.games
}
```

Task 7 consumes this return value.

- [ ] **Step 10: Update `LibraryScreen` merge call**

Use:

```ts
return mergeGames(library.data.games, hltb.data?.entries ?? {}, hltb.data?.meta ?? {})
```

Update existing test mocks to include `meta` keyed by appid.

- [ ] **Step 11: Verify**

Run:

```bash
rtk pnpm vitest run tests/app/api/hltb/route.test.ts tests/app/api/hltb/appid-route.test.ts tests/app/api/hltb/overrides-route.test.ts tests/lib/library/merge.test.ts tests/components/library-screen.test.tsx tests/hooks/use-hltb.test.ts
rtk pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
rtk git add app/api/hltb tests/app/api/hltb lib/client-fetch.ts hooks/use-hltb.ts lib/library/merge.ts app/library/library-screen.tsx tests/lib/library/merge.test.ts tests/components/library-screen.test.tsx tests/hooks/use-hltb.test.ts
rtk git commit -m "feat: server-owned HLTB API with metadata-aware client"
```

---

### Task 6: Add Inline Editable HLTB Search Name Column

**Files:**
- Create: `components/library-table/cells/hltb-search-name-cell.tsx`
- Create: `components/library-table/cells/hltb-search-name-editor.tsx`
- Modify: `components/library-table/use-library-columns.tsx`
- Modify: `components/library-table/library-table.tsx`
- Modify: `components/library-table/types.ts`
- Test: `tests/components/library-table/hltb-search-name-cell.test.tsx`
- Test: `tests/components/library-table/library-table.smoke.test.tsx`

- [ ] **Step 1: Write cell tests**

Test display + selector behavior:
- `getHltbSearchName(meta)` returns override when present (imported from `lib/hltb/meta.ts`);
- returns Steam name when override absent;
- reset button hidden for `source: 'steam-import'`;
- reset button visible only when fallback row has override;
- readonly display shows matched/direct status for direct-mapped rows;
- placeholder rendered when `meta === null` (e.g. HLTB still loading).

Test editor behavior:
- editor commits on Enter and calls `onCommit(row, value)` exactly once;
- editor commits on blur **only when no explicit Enter commit happened**;
- Escape closes without committing.

- [ ] **Step 2: Run failing cell tests**

Run: `rtk pnpm vitest run tests/components/library-table/hltb-search-name-cell.test.tsx`

Expected: FAIL because components don't exist.

- [ ] **Step 3: Implement display cell**

Create `components/library-table/cells/hltb-search-name-cell.tsx`:

```tsx
'use client'

import { RotateCcw } from 'lucide-react'
import type { HltbMeta } from '@/types/game'
import { Button } from '@/components/ui/button'
import { getHltbSearchName } from '@/lib/hltb/meta'

export function HltbSearchNameCell({
  meta,
  matchedName,
  onReset,
}: {
  meta: HltbMeta | null
  matchedName: string | null
  onReset?: () => void
}) {
  if (!meta) return <span className="text-muted-foreground">--</span>
  if (meta.source === 'steam-import') {
    return <span className="truncate">{matchedName ?? meta.steamName}</span>
  }
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{getHltbSearchName(meta)}</span>
      {meta.overrideName !== null && onReset ? (
        <Button type="button" variant="ghost" size="icon" onClick={onReset} aria-label="Reset HLTB search name">
          <RotateCcw className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </span>
  )
}
```

- [ ] **Step 4: Implement inline editor**

Create `components/library-table/cells/hltb-search-name-editor.tsx`. The editor owns its draft state locally — **no** `hltbSearchNameDraft` field is added to `GameRow`:

```tsx
'use client'

import { useRef } from 'react'
import type { RenderEditCellProps } from 'react-data-grid'
import type { GameRow } from '@/types/game'
import { getHltbSearchName } from '@/lib/hltb/meta'

export function HltbSearchNameEditor({
  onClose,
  row,
  onCommit,
}: RenderEditCellProps<GameRow> & {
  onCommit: (row: GameRow, value: string) => void
}) {
  const committedRef = useRef(false)
  const initial = row.hltbMeta ? getHltbSearchName(row.hltbMeta) : row.name

  const commit = (value: string) => {
    if (committedRef.current) return
    committedRef.current = true
    onCommit(row, value)
    onClose(true)
  }

  return (
    <input
      autoFocus
      defaultValue={initial}
      className="h-full w-full bg-background px-2 text-sm outline-none"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit(event.currentTarget.value)
        } else if (event.key === 'Escape') {
          onClose(false)
        }
      }}
      onBlur={(event) => {
        if (committedRef.current) return
        commit(event.currentTarget.value)
      }}
    />
  )
}
```

This guarantees Enter → blur sequence doesn't double-commit; Escape still cancels because `committedRef` never flips.

- [ ] **Step 5: Add column in `use-library-columns.tsx`**

```tsx
{
  key: 'hltbSearchName',
  name: 'HLTB Search',
  sortable: false,
  width: 220,
  editable: (row) => row.hltbMeta?.source !== 'steam-import',
  renderCell: ({ row }) => (
    <HltbSearchNameCell
      meta={row.hltbMeta}
      matchedName={row.hltb?.matchedName ?? null}
      onReset={() => onHltbSearchNameCommit?.(row, null)}
    />
  ),
  renderEditCell: (props) => (
    <HltbSearchNameEditor
      {...props}
      onCommit={(row, value) => onHltbSearchNameCommit?.(row, value)}
    />
  ),
}
```

`onHltbSearchNameCommit` is an optional prop passed into the columns hook. Task 7 wires the implementation; until then the column renders harmlessly.

- [ ] **Step 6: Wire `LibraryTable` prop**

Add an **optional** prop to `LibraryTable`:

```ts
onHltbSearchNameCommit?: (row: GameRow, searchName: string | null) => void | Promise<void>
```

Pass it through to `useLibraryColumns`. No `onRowsChange` bridge is needed because the editor calls `onCommit` directly. Since the prop is optional and defaults to no-op, Task 6 can ship independently.

- [ ] **Step 7: Update tests**

Add/extend tests:
- column renders `HLTB Search`;
- direct-mapped row's `editable(row)` returns `false`;
- fallback row's `editable(row)` returns `true`;
- editor calls `onCommit` once with the typed value on Enter, then `onClose(true)`;
- editor does not double-commit on blur after Enter.

Full keyboard editing is hard in jsdom; unit-test the editor component directly and unit-test `useLibraryColumns` return values for `editable(row)`.

- [ ] **Step 8: Verify**

Run:

```bash
rtk pnpm vitest run tests/components/library-table/hltb-search-name-cell.test.tsx tests/components/library-table/library-table.smoke.test.tsx
rtk pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add components/library-table tests/components/library-table
rtk git commit -m "feat: add inline HLTB search name editing"
```

---

### Task 7: Wire Override Save From Library Screen

**Files:**
- Modify: `app/library/library-screen.tsx`
- Modify: `hooks/use-hltb.ts` (only if helpers need adjustment after integration)
- Test: `tests/components/library-screen.test.tsx`

- [ ] **Step 1: Write failing component test**

Mock `saveHltbOverrideAndRefresh` and `refreshLibrary` from `hooks/use-hltb` / `hooks/use-library`.

Test:
- committing a changed fallback name calls `saveHltbOverrideAndRefresh` with `{ appid, searchName }`;
- committing Steam name or blank sends `searchName: null`;
- save failure shows toast and leaves screen usable;
- manual library refresh uses the games returned by `refreshLibrary` (not stale `library.data`) and invalidates `HLTB_QUERY_KEY`.

- [ ] **Step 2: Run failing test**

Run: `rtk pnpm vitest run tests/components/library-screen.test.tsx`

Expected: FAIL because table prop / save handler not wired.

- [ ] **Step 3: Add save handler**

In `LibraryScreen`:

```tsx
<LibraryTable
  rows={visibleRows}
  hltbLoading={hltb.isFetching}
  onHltbSearchNameCommit={async (row, searchName) => {
    const normalized = searchName?.trim() ?? ''
    const nextName = normalized === '' || normalized === row.name ? null : normalized
    try {
      await saveHltbOverrideAndRefresh({
        appid: row.appid,
        queryClient,
        searchName: nextName,
      })
    } catch (error) {
      toast.error(`HLTB override update failed: ${(error as Error).message}`)
    }
  }}
/>
```

Use row `name` as the Steam API name for reset comparison.

Update the existing `onRefreshLibrary` callback to use the value returned by `refreshLibrary` (extended in Task 5):

```ts
const freshGames = await refreshLibrary(queryClient)
await queryClient.invalidateQueries({ queryKey: HLTB_QUERY_KEY })
```

This guarantees the post-refresh HLTB request runs against the freshest library without relying on a re-render of `library.data`.

- [ ] **Step 4: Verify**

Run:

```bash
rtk pnpm vitest run tests/components/library-screen.test.tsx tests/components/library-table/library-table.smoke.test.tsx
rtk pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add app/library/library-screen.tsx hooks/use-hltb.ts tests/components/library-screen.test.tsx
rtk git commit -m "feat: save HLTB search name overrides from table"
```

---

### Task 8: Final Verification And Documentation Update

**Files:**
- Modify: `README.md` if behavior needs user-facing explanation
- Possibly modify: `docs/superpowers/specs/2026-05-24-hltb-steam-id-mapping-design.md` only if implementation deliberately differs

- [ ] **Step 1: Run focused test suite**

Run:

```bash
rtk pnpm vitest run tests/lib/cache/kv.test.ts tests/lib/hltb/client.test.ts tests/lib/hltb/resolve.test.ts tests/lib/library/server.test.ts tests/lib/library/merge.test.ts tests/app/api/hltb/route.test.ts tests/app/api/hltb/appid-route.test.ts tests/app/api/hltb/overrides-route.test.ts tests/components/library-screen.test.tsx tests/components/library-table/hltb-search-name-cell.test.tsx tests/components/library-table/library-table.smoke.test.tsx tests/hooks/use-hltb.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
rtk pnpm test
rtk pnpm tsc --noEmit
rtk pnpm lint
rtk pnpm build
```

Expected: all pass.

- [ ] **Step 3: Manual smoke test**

Run dev server:

```bash
rtk pnpm dev
```

Open `http://localhost:3000/library`.

Verify:
- library loads;
- `/api/hltb` is a `GET` in network logs (no request body);
- rows with imported/direct mappings are readonly in the HLTB Search column;
- fallback rows can be edited inline;
- pressing Enter commits exactly one `PUT /api/hltb/overrides/:appid` (check Network tab — no double request);
- reset clears override and reverts to Steam name;
- refresh HLTB still works;
- refresh library still works and triggers a fresh HLTB query afterwards.

- [ ] **Step 4: Update README if needed**

Add a short note under caching or verification:

```md
HLTB matching first uses a shared Steam appid -> HLTB id mapping discovered from HLTB's Steam import endpoint. Games without a direct mapping can be corrected per user by editing the HLTB Search value in the library table.
```

- [ ] **Step 5: Commit final docs if changed**

```bash
rtk git add README.md docs/superpowers/specs/2026-05-24-hltb-steam-id-mapping-design.md
rtk git commit -m "docs: document HLTB override workflow"
```

Skip this commit if no docs changed.

---

### Task 9: Remove Legacy Name-Based HLTB Cache

> **Run after the new resolver has been live long enough that no production read traffic depends on `hltb:v2:` keys.** This task removes the compatibility-only name-keyed cache (`getHltb` / `setHltb` / `hltbKey`) introduced before this feature. Cache entries on disk under `.cache/hltb:v2:*` are orphaned by code removal; document a one-time wipe (`rm -rf .cache/`) in the migration notes if needed.

**Files:**
- Modify: `lib/cache/kv.ts`
- Modify: `lib/hltb/resolve.ts`
- Test: `tests/lib/cache/kv.test.ts`
- Test: `tests/lib/hltb/resolve.test.ts`

- [ ] **Step 1: Confirm no callers remain**

Run:

```bash
rtk grep -n "kv\.getHltb\b" -- "lib/**" "app/**" "tests/**"
rtk grep -n "kv\.setHltb\b" -- "lib/**" "app/**" "tests/**"
```

The only expected matches are inside `lib/hltb/resolve.ts` (name-search fallback) and the resolver tests that mock them. If any other caller appears, migrate it before continuing.

- [ ] **Step 2: Update resolver to drop the compat cache**

Remove the `kv.getHltb(searchName)` / `kv.setHltb(searchName, ...)` calls from the name-search branch. Name-search results then live only inside the HLTB Steam import / per-row response cycle (no persistence beyond the HLTB entry cache when a mapping is later discovered).

Update `tests/lib/hltb/resolve.test.ts` to drop assertions on the name cache and confirm `searchByName` is called every time the resolver hits the name-search branch under `force=false`.

- [ ] **Step 3: Remove `getHltb` / `setHltb` / `hltbKey`**

In `lib/cache/kv.ts`, delete the unused helpers and constants. Remove the now-unused `normalizeName` import if no other consumer exists.

Update `tests/lib/cache/kv.test.ts` to remove the legacy cases.

- [ ] **Step 4: Verify**

Run:

```bash
rtk pnpm vitest run tests/lib/hltb/resolve.test.ts tests/lib/cache/kv.test.ts
rtk pnpm test
rtk pnpm tsc --noEmit
rtk pnpm lint
rtk pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/cache/kv.ts lib/hltb/resolve.ts tests/lib/cache/kv.test.ts tests/lib/hltb/resolve.test.ts
rtk git commit -m "chore: remove legacy name-based HLTB cache"
```

---

## Implementation Notes For Workers

- Do not overwrite unrelated local changes. At the time this plan was written, `next-env.d.ts` had an unrelated modification.
- Keep server-side library code in errors-as-values style. Client fetchers may throw because TanStack Query expects rejected promises.
- Do not write fuzzy/name-search results into the global mapping cache (`hltb-map:steam-app:*`).
- Do not store overrides for direct-mapped rows. The override route returns `409 mapping_exists`. The resolver also always returns `overrideName: null` for `source: 'steam-import'`, even when a dormant KV override exists; we don't proactively delete those rows.
- Missing HLTB metadata in `mergeGames` stays as `hltbMeta: null` — never synthesize `source: 'none'`, because that source means "search was attempted and missed".
- Keep per-game HLTB failures isolated; one failure must not fail the whole `/api/hltb` response. `HltbRateLimitError` is logged and treated as a miss for that game.
- Use `react-data-grid` `editable(row)` plus `renderEditCell`; there is no top-level `isCellEditable` prop. The grid passes `isCellEditable` into render props, but editability is controlled by the column definition.
- The inline editor owns its draft locally and uses a `committedRef` guard to prevent Enter + blur from firing `onCommit` twice. Do not introduce an `hltbSearchNameDraft` field on `GameRow`.
- Avoid changing sort semantics for existing columns unless the new HLTB Search column is intentionally made sortable. The plan keeps it unsortable.
- The TanStack Query key is the constant `HLTB_QUERY_KEY = ['hltb']`. Do not encode appids into the key — the server owns library loading by `steamId`.
- Prefix shell commands with `rtk` per repo CLAUDE.md to keep token usage down.
