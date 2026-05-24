# HLTB Steam ID Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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
  - Add mapping, entry-by-id, override, override-list, and snapshot helpers.
- Modify `lib/hltb/client.ts`
  - Add HLTB Steam import and detail-by-HLTB-id functions while keeping `searchByName`.
- Create `lib/hltb/resolve.ts`
  - Pure-ish server resolver that orchestrates mapping-first lookup, snapshot-gated import, and fallback name search.
- Replace `app/api/hltb/route.ts`
  - Convert from `POST { games }` to `GET /api/hltb?force=0|1`.
- Create `app/api/hltb/[appid]/route.ts`
  - One-row `GET` response for the current user's library game.
- Create `app/api/hltb/overrides/route.ts`
  - `GET` all current-user overrides.
- Create `app/api/hltb/overrides/[appid]/route.ts`
  - `PUT` create/update/delete one override.
- Modify `lib/client-fetch.ts`
  - Update HLTB fetchers and add override API helper.
- Modify `hooks/use-hltb.ts`
  - Remove `games` request body, keep query keyed by current appids, add row refresh/override helpers.
- Modify `lib/library/merge.ts`
  - Merge HLTB `entries` and `meta` into `GameRow`.
- Modify `app/library/library-screen.tsx`
  - Pass HLTB metadata and override-save handler into the table.
- Modify `components/library-table/library-table.tsx`
  - Add `onRowsChange` bridge for editable HLTB search-name cells.
- Modify `components/library-table/use-library-columns.tsx`
  - Add editable HLTB search-name column using `renderEditCell` and `editable(row)`.
- Create `components/library-table/cells/hltb-search-name-cell.tsx`
  - Read display + edit cell renderer for fallback search names and reset control.
- Modify `components/library-table/types.ts`
  - Add sortable key if the new column should sort, or explicitly keep it unsortable.
- Add/modify tests under `tests/lib/**`, `tests/app/api/**`, and `tests/components/**` as described below.

Route layout note: keep `app/api/hltb/overrides/...` as a literal route folder and `app/api/hltb/[appid]/route.ts` as the dynamic route. Validate `[appid]` as a positive integer so `/api/hltb/overrides` can never be treated as a valid appid.

## Shared Decisions

- Library snapshot TTL: `12 * 60 * 60 * 1000` (12 hours).
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

- UI helper:

```ts
export function getHltbSearchName(meta: HltbMeta): string {
  return meta.overrideName ?? meta.steamName
}
```

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

Run: `pnpm vitest run tests/lib/library/server.test.ts`

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
pnpm vitest run tests/lib/library/server.test.ts
pnpm vitest run tests/lib/steam/client.test.ts tests/components/library-screen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/library/server.ts app/api/library/route.ts tests/lib/library/server.test.ts
git commit -m "refactor: share server library loader"
```

---

### Task 2: Add HLTB Mapping, Override, Snapshot Types And KV Helpers

**Files:**
- Modify: `types/game.ts`
- Modify: `lib/cache/kv.ts`
- Test: `tests/lib/cache/kv.test.ts`

- [ ] **Step 1: Write failing KV tests**

Extend `tests/lib/cache/kv.test.ts` for:
- `getHltbMapping` / `setHltbMapping` use `hltb-map:steam-app:{appid}`;
- `getHltbEntryById` / `setHltbEntryById` use `hltb-entry:hltb-id:{hltbId}` with 7 day TTL;
- `getHltbOverrideName` / `setHltbOverrideName` / `deleteHltbOverrideName` use `hltb-override-name:{steamId}:{appid}`;
- `getHltbOverrideNames` lists user overrides using `storage.getKeys`;
- `getHltbLibrarySnapshot` / `setHltbLibrarySnapshot` use `hltb-library-snapshot:{steamId}` with 12 hour TTL.

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

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run tests/lib/cache/kv.test.ts`

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

export type HltbOverridesResponse = {
  overrides: Record<number, string>
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
const LIBRARY_SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000
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

Use the existing `get<T>` and `set<T>` wrappers. Add a `remove(key)` wrapper using `storage.removeItem` and a `getKeys(base)` wrapper using `storage.getKeys(base)` with `KvError`.

Important behavior:
- `setHltbOverrideName` trims before write.
- `deleteHltbOverrideName` removes key.
- `getHltbOverrideNames(steamId)` returns `Record<number, string>` and ignores malformed keys/values.
- Keep existing `getHltb` / `setHltb` temporarily for compatibility until resolver migration is complete.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm vitest run tests/lib/cache/kv.test.ts
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add types/game.ts lib/cache/kv.ts tests/lib/cache/kv.test.ts
git commit -m "feat: add HLTB mapping cache primitives"
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
- `fetchById` returns `HltbFetchError` on malformed data.

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

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run tests/lib/hltb/client.test.ts`

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
  // Extract pageProps.game.data.game[0], return toEntry(raw)
}
```

Keep parsing defensive; return `null` only for valid "not found" empty game arrays, otherwise `HltbFetchError`.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm vitest run tests/lib/hltb/client.test.ts
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/hltb/client.ts tests/lib/hltb/client.test.ts
git commit -m "feat: add HLTB import and id lookup client"
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
- unmapped + expired snapshot: calls import even when unmapped appids are present in the old snapshot;
- unmapped + fresh snapshot missing at least one unmapped appid: calls import;
- unmapped + fresh snapshot covering appids: skips import and uses fallback search;
- global mapping wins over override;
- override wins over Steam name without mapping;
- Steam name used when no override;
- `force=true` bypasses HLTB entry cache and name cache reads but still uses mapping/snapshot policy;
- detail-by-id failure returns `null` with `source: 'steam-import'`;
- fallback miss returns `source: 'none'` with `steamName` and `overrideName`.

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

Run: `pnpm vitest run tests/lib/hltb/resolve.test.ts`

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
3. If `unmappedAppids.length > 0`, read snapshot.
4. Import if snapshot missing/expired or at least one unmapped appid is not in snapshot.
5. On import success:
   - write each mapping via `setHltbMapping`;
   - update snapshot via `setHltbLibrarySnapshot(steamId, currentAppids)`;
   - re-read mappings for previously unmapped appids.
6. On import failure:
   - log warning;
   - do not update snapshot.

Do not let KV failures throw out of resolver.

- [ ] **Step 5: Implement per-game resolution**

For each game under `p-limit(5)`:

```ts
if (mapping exists) {
  if (!force) read kv.getHltbEntryById(mapping.hltbId)
  if cache miss or force, call hltb.fetchById(mapping.hltbId), then kv.setHltbEntryById
  return source 'steam-import', overrideName null
}

const override = await kv.getHltbOverrideName(steamId, game.appid)
const searchName = override?.value.searchName ?? game.name
const source = override ? 'override-name' : 'steam-name'
const result = await hltb.searchByName(searchName)
if result null -> source 'none'
```

Name-search fallback may continue using existing `getHltb(name)` / `setHltb(name)` when `force=false`. This is compatibility cache only; do not write global mapping from name search.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm vitest run tests/lib/hltb/resolve.test.ts
pnpm vitest run tests/lib/hltb/client.test.ts tests/lib/cache/kv.test.ts
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/hltb/resolve.ts tests/lib/hltb/resolve.test.ts
git commit -m "feat: resolve HLTB data by Steam app mappings"
```

---

### Task 5: Replace HLTB API Routes

**Files:**
- Modify: `app/api/hltb/route.ts`
- Create: `app/api/hltb/[appid]/route.ts`
- Create: `app/api/hltb/overrides/route.ts`
- Create: `app/api/hltb/overrides/[appid]/route.ts`
- Test: `tests/app/api/hltb/route.test.ts`
- Test: `tests/app/api/hltb/appid-route.test.ts`
- Test: `tests/app/api/hltb/overrides-route.test.ts`

- [ ] **Step 1: Write failing route tests**

Mock:
- `@/auth`;
- `@/lib/library/server`;
- `@/lib/hltb/resolve`;
- `@/lib/cache/kv`.

Cover:
- `GET /api/hltb` returns 401 without session;
- `GET /api/hltb` loads library server-side and calls resolver;
- `force=1` passes `{ force: true }` to `loadUserLibrary`? No: per spec, HLTB force must not force Steam library. So `GET /api/hltb?force=1` calls `loadUserLibrary({ force: false })` and resolver with `force: true`.
- `GET /api/hltb/[appid]` returns 400 for non-positive/non-numeric appid;
- `GET /api/hltb/[appid]` returns 404 when appid not in current library;
- `PUT /api/hltb/overrides/[appid]` returns 409 when mapping exists;
- `PUT /api/hltb/overrides/[appid]` returns 400 for invalid JSON or invalid body shape;
- `PUT` deletes override on blank or Steam-name-equivalent body;
- `GET /api/hltb/overrides` returns current user override map.

- [ ] **Step 2: Run failing route tests**

Run:

```bash
pnpm vitest run tests/app/api/hltb/route.test.ts tests/app/api/hltb/appid-route.test.ts tests/app/api/hltb/overrides-route.test.ts
```

Expected: FAIL because routes/helpers do not exist or old route is POST-only.

- [ ] **Step 3: Replace `app/api/hltb/route.ts`**

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

Remove the old `POST` handler unless compatibility is explicitly needed. The spec says server-owned `GET`.

- [ ] **Step 4: Add `GET /api/hltb/[appid]`**

Use route signature compatible with Next 16 route handlers:

```ts
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appid: string }> },
) {
  const { appid } = await params
  // validate, auth, load library, find game, resolve one
}
```

Return `HltbSingleResponse`.

- [ ] **Step 5: Add override routes**

`app/api/hltb/overrides/route.ts`:

```ts
export async function GET() {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })
  const overrides = await kv.getHltbOverrideNames(session.user.steamId)
  if (overrides instanceof Error) return json(500, { error: 'internal' })
  return json(200, { overrides })
}
```

`app/api/hltb/overrides/[appid]/route.ts`:
- auth;
- validate appid;
- load current library with `force: false`;
- 404 if missing;
- 409 if `getHltbMapping(appid)` returns mapping;
- parse body `{ searchName: string | null }`;
- delete when null/blank/equal to Steam name after trim;
- otherwise store trimmed override.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm vitest run tests/app/api/hltb/route.test.ts tests/app/api/hltb/appid-route.test.ts tests/app/api/hltb/overrides-route.test.ts
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/hltb tests/app/api/hltb
git commit -m "feat: add server-owned HLTB API routes"
```

---

### Task 6: Update Client Fetchers And HLTB Hook

**Files:**
- Modify: `lib/client-fetch.ts`
- Modify: `hooks/use-hltb.ts`
- Test: `tests/hooks/use-hltb.test.ts` if existing hook test patterns are convenient; otherwise cover through component tests in Task 8.

- [ ] **Step 1: Update client API types in tests**

If adding hook tests, mock `fetch` and verify:
- `fetchHltb({ force: false })` calls `GET /api/hltb`;
- `fetchHltb({ force: true })` calls `GET /api/hltb?force=1`;
- `fetchHltbGame({ appid })` calls `GET /api/hltb/{appid}`;
- `putHltbOverrideName({ appid, searchName })` calls `PUT /api/hltb/overrides/{appid}`.

- [ ] **Step 2: Modify `lib/client-fetch.ts`**

Replace old `fetchHltb({ games, force })` with:

```ts
export async function fetchHltb({ force }: { force: boolean }) {
  const res = await fetch(`/api/hltb${force ? '?force=1' : ''}`).catch(...)
  // return HltbResponse
}

export async function fetchHltbGame({ appid }: { appid: number }) {
  const res = await fetch(`/api/hltb/${appid}`).catch(...)
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
  }).catch(...)
  // return void or parsed response
}
```

- [ ] **Step 3: Modify `hooks/use-hltb.ts`**

Keep query key dependent on appids so current library changes still refetch:

```ts
export function useHltb({ games }: { games: SteamGame[] | undefined }) {
  const appids = useMemo(() => games?.map((game) => game.appid) ?? [], [games])
  return useQuery({
    enabled: games !== undefined && games.length > 0,
    queryKey: hltbQueryKey(appids),
    queryFn: () => fetchHltb({ force: false }),
    ...
  })
}
```

Update `refreshHltb`:

```ts
export async function refreshHltb(queryClient: QueryClient, games: SteamGame[]) {
  await queryClient.fetchQuery({
    queryKey: hltbQueryKey(games.map((game) => game.appid)),
    queryFn: () => fetchHltb({ force: true }),
    staleTime: 0,
  })
}
```

Add helper:

```ts
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
  queryClient.setQueriesData({ queryKey: ['hltb'] }, (old) => mergeSingleHltbResult(old, appid, single))
}
```

If `setQueriesData` is too broad in implementation, invalidate the current `hltbQueryKey(appids)` instead. Prefer row refresh if straightforward.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm vitest run tests/components/library-screen.test.tsx
pnpm tsc --noEmit
```

Expected: compile/test failures until UI merge is updated in Task 7/8 are acceptable if this task is implemented in the same working branch. Do not commit with failing tests; if failures are due to UI types, include Task 7 in the same commit or defer commit until Task 7.

- [ ] **Step 5: Commit**

If tests pass independently:

```bash
git add lib/client-fetch.ts hooks/use-hltb.ts tests/hooks/use-hltb.test.ts
git commit -m "feat: update HLTB client query contract"
```

If UI type failures require Task 7, combine commit after Task 7.

---

### Task 7: Merge HLTB Metadata Into Rows

**Files:**
- Modify: `lib/library/merge.ts`
- Modify: `app/library/library-screen.tsx`
- Test: `tests/lib/library/merge.test.ts`
- Test: `tests/components/library-screen.test.tsx`

- [ ] **Step 1: Write failing merge tests**

Update `tests/lib/library/merge.test.ts` to include metadata:

```ts
const rows = mergeGames(games, entries, meta)
expect(rows[0].hltbMeta).toEqual({
  source: 'steam-import',
  steamName: 'Portal',
  overrideName: null,
})
```

Also test missing metadata falls back to:

```ts
{
  source: 'none',
  steamName: game.name,
  overrideName: null,
}
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run tests/lib/library/merge.test.ts`

Expected: FAIL because `mergeGames` currently accepts only entries.

- [ ] **Step 3: Update `mergeGames`**

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
    hltbMeta: hltbMeta[game.appid] ?? {
      source: 'none',
      steamName: game.name,
      overrideName: null,
    },
  }))
}
```

- [ ] **Step 4: Update `LibraryScreen` merge call**

Use:

```ts
return mergeGames(library.data.games, hltb.data?.entries ?? {}, hltb.data?.meta ?? {})
```

Update test mocks to include `meta`.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm vitest run tests/lib/library/merge.test.ts tests/components/library-screen.test.tsx
pnpm tsc --noEmit
```

Expected: PASS or only table editing tests pending. Do not commit with type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/library/merge.ts app/library/library-screen.tsx tests/lib/library/merge.test.ts tests/components/library-screen.test.tsx
git commit -m "feat: merge HLTB metadata into library rows"
```

---

### Task 8: Add Inline Editable HLTB Search Name Column

**Files:**
- Create: `components/library-table/cells/hltb-search-name-cell.tsx`
- Modify: `components/library-table/use-library-columns.tsx`
- Modify: `components/library-table/library-table.tsx`
- Modify: `components/library-table/types.ts`
- Test: `tests/components/library-table/hltb-search-name-cell.test.tsx`
- Test: `tests/components/library-table/library-table.smoke.test.tsx`

- [ ] **Step 1: Write cell tests**

Test helper behavior:
- `getHltbSearchName(meta)` returns override when present;
- returns Steam name when override absent;
- reset button hidden for `source: 'steam-import'`;
- reset button visible only when fallback row has override;
- readonly display shows matched/direct status for direct-mapped rows.

- [ ] **Step 2: Run failing cell tests**

Run: `pnpm vitest run tests/components/library-table/hltb-search-name-cell.test.tsx`

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement cell component**

Create `components/library-table/cells/hltb-search-name-cell.tsx`:

```tsx
'use client'

import { RotateCcw } from 'lucide-react'
import type { HltbMeta } from '@/types/game'
import { Button } from '@/components/ui/button'

export function getHltbSearchName(meta: HltbMeta): string {
  return meta.overrideName ?? meta.steamName
}

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

Adjust class names to match project style and keep row height stable.

- [ ] **Step 4: Add edit cell renderer in columns**

Use `react-data-grid` APIs:
- column must have `renderEditCell`;
- column `editable` function controls per-row editability.

Column shape:

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
  renderEditCell: ({ row, onRowChange, onClose }) => (
    <input
      autoFocus
      className="h-full w-full bg-background px-2 text-sm outline-none"
      defaultValue={row.hltbMeta ? getHltbSearchName(row.hltbMeta) : row.name}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          const value = event.currentTarget.value
          onRowChange({ ...row, hltbSearchNameDraft: value }, true)
          onClose(true)
        } else if (event.key === 'Escape') {
          onClose(false)
        }
      }}
      onBlur={(event) => {
        onRowChange({ ...row, hltbSearchNameDraft: event.currentTarget.value }, true)
      }}
    />
  ),
}
```

Implementation may use a small dedicated editor component instead of inline JSX. Do not persist `hltbSearchNameDraft` in domain types if avoidable; use `onRowsChange` data to detect changed row.

- [ ] **Step 5: Wire `LibraryTable` onRowsChange**

Add prop:

```ts
onHltbSearchNameCommit?: (row: GameRow, searchName: string | null) => Promise<void> | void
```

In `DataGrid`, pass `onRowsChange`. Inspect `RowsChangeData` to identify the changed indexes and column key. For the `hltbSearchName` column, call the prop with trimmed value:

```ts
onRowsChange={(nextRows, data) => {
  if (data.column.key !== 'hltbSearchName') return
  const row = nextRows[data.indexes[0]]
  const draft = row.hltbSearchNameDraft
  onHltbSearchNameCommit?.(row, draft)
}}
```

If adding a draft property to `GameRow` is awkward, keep a local editor component that calls `onCommit(row, value)` directly and closes the editor.

- [ ] **Step 6: Update tests**

Add/extend tests to verify:
- column renders `HLTB Search`;
- direct mapped row is not editable by column `editable(row)`;
- fallback row is editable;
- reset button callback fires only for override rows.

It is acceptable to unit-test `useLibraryColumns` return values directly for `editable(row)` and smoke-test rendering, because full grid keyboard editing is hard in jsdom.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm vitest run tests/components/library-table/hltb-search-name-cell.test.tsx tests/components/library-table/library-table.smoke.test.tsx
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/library-table tests/components/library-table
git commit -m "feat: add inline HLTB search name editing"
```

---

### Task 9: Wire Override Save From Library Screen

**Files:**
- Modify: `app/library/library-screen.tsx`
- Modify: `hooks/use-hltb.ts`
- Test: `tests/components/library-screen.test.tsx`

- [ ] **Step 1: Write failing component test**

Mock `saveHltbOverrideAndRefresh` or `putHltbOverrideName` from `hooks/use-hltb`.

Test:
- committing a changed fallback name calls save helper with appid and value;
- committing Steam name or blank sends `null`;
- save failure shows toast and leaves screen usable.

- [ ] **Step 2: Run failing test**

Run: `pnpm vitest run tests/components/library-screen.test.tsx`

Expected: FAIL because table prop/save helper not wired.

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

Also update the existing `onRefreshLibrary` callback: after `refreshLibrary(queryClient)` succeeds, invalidate the current HLTB query for the refreshed library appids if library data is available. This ensures manual library refresh runs the mapping-first HLTB policy even when appids are unchanged.

Expected shape:

```ts
await refreshLibrary(queryClient)
if (library.data?.games) {
  await queryClient.invalidateQueries({
    queryKey: hltbQueryKey(library.data.games.map((game) => game.appid)),
  })
}
```

If `refreshLibrary` returns the fresh library payload during implementation, prefer using returned games over stale `library.data.games`.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm vitest run tests/components/library-screen.test.tsx tests/components/library-table/library-table.smoke.test.tsx
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/library/library-screen.tsx hooks/use-hltb.ts tests/components/library-screen.test.tsx
git commit -m "feat: save HLTB search name overrides from table"
```

---

### Task 10: Final Verification And Documentation Update

**Files:**
- Modify: `README.md` if behavior needs user-facing explanation
- Possibly modify: `docs/superpowers/specs/2026-05-24-hltb-steam-id-mapping-design.md` only if implementation deliberately differs

- [ ] **Step 1: Run focused test suite**

Run:

```bash
pnpm vitest run tests/lib/cache/kv.test.ts tests/lib/hltb/client.test.ts tests/lib/hltb/resolve.test.ts tests/lib/library/server.test.ts tests/lib/library/merge.test.ts tests/app/api/hltb/route.test.ts tests/app/api/hltb/appid-route.test.ts tests/app/api/hltb/overrides-route.test.ts tests/components/library-screen.test.tsx tests/components/library-table/hltb-search-name-cell.test.tsx tests/components/library-table/library-table.smoke.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm tsc --noEmit
pnpm lint
pnpm build
```

Expected: all pass.

- [ ] **Step 3: Manual smoke test**

Run dev server:

```bash
pnpm dev
```

Open `http://localhost:3000/library`.

Verify:
- library loads;
- `/api/hltb` is a GET in network logs;
- rows with imported/direct mappings are readonly in HLTB Search column;
- fallback rows can be edited inline;
- reset clears override and reverts to Steam name;
- refresh HLTB still works;
- refresh library still works.

- [ ] **Step 4: Update README if needed**

Add a short note under caching or verification:

```md
HLTB matching first uses a shared Steam appid -> HLTB id mapping discovered from HLTB's Steam import endpoint. Games without a direct mapping can be corrected per user by editing the HLTB Search value in the library table.
```

- [ ] **Step 5: Commit final docs if changed**

```bash
git add README.md docs/superpowers/specs/2026-05-24-hltb-steam-id-mapping-design.md
git commit -m "docs: document HLTB override workflow"
```

Skip this commit if no docs changed.

---

## Implementation Notes For Workers

- Do not overwrite unrelated local changes. At the time this plan was written, `next-env.d.ts` had an unrelated modification.
- Keep server-side library code in errors-as-values style. Client fetchers may throw because TanStack Query expects rejected promises.
- Do not write fuzzy/name-search results into the global mapping cache.
- Do not store overrides for direct-mapped rows. The override route returns `409 mapping_exists`.
- Keep per-game HLTB failures isolated; one failure must not fail the whole `/api/hltb` response.
- Use `react-data-grid` `editable(row)` plus `renderEditCell`; there is no top-level `isCellEditable` prop. The grid passes `isCellEditable` into render props, but editability is controlled by the column definition.
- Avoid changing sort semantics for existing columns unless the new HLTB Search column is intentionally made sortable. The plan keeps it unsortable.
