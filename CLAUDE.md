# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                 # next dev --turbopack
pnpm build               # next build (production)
pnpm test                # vitest run (all unit tests)
pnpm test:watch          # vitest in watch mode
pnpm test:coverage       # vitest run --coverage
pnpm lint                # eslint
pnpm tsc --noEmit        # type-check (no script alias)

# Run a single test file or pattern
pnpm vitest run tests/lib/hltb/matcher.test.ts
pnpm vitest run -t "private profile"

# Vercel deploy (requires Vercel CLI)
pnpm deploy              # vercel (preview)
pnpm deploy:prod         # vercel --prod
pnpm env:pull            # pull env vars from Vercel
```

Vitest uses `jsdom` and only picks up `tests/**/*.test.{ts,tsx}` (see [vitest.config.ts](vitest.config.ts)). `tests/setup.ts` injects placeholder env vars so `lib/env.ts` parses during tests — never write tests that hit real Steam/HLTB.

Required env (`.env.local`): `STEAM_API_KEY`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`. Parsed and validated at module load by [lib/env.ts](lib/env.ts) — importing anything that touches it without these set will throw.

The local server cache lives in `.cache/` (gitignored). Delete it to wipe Steam library and HLTB results.

## Architecture

### Request flow

Steam OpenID sign-in → JWT stores `steamId` → client fetches library + HLTB through own API routes → results merged client-side by `appid`.

1. **Auth** ([auth.ts](auth.ts), [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts)) — `next-auth-steam` provider with custom JWT/session callbacks that surface `session.user.steamId`. `getAuthOptions(req)` is request-scoped because the Steam provider needs the incoming Request; the top-level `authOptions` uses a fallback request only for `auth()` server-side calls.
2. **Library API** ([app/api/library/route.ts](app/api/library/route.ts)) — `auth()` gate → cache lookup → Steam `IPlayerService/GetOwnedGames` → cache write. Empty `games` array from Steam means private profile (returns 403 `private_profile`), translated client-side to `LibraryFetchError` with `code: 'private_profile'`.
3. **HLTB API** ([app/api/hltb/route.ts](app/api/hltb/route.ts)) — `auth()` gate → `loadUserLibrary()` → `resolveHltbForLibrary()`. The server loads the library itself; **the client no longer sends the game list**. Force-refresh via `?force=1`.
4. **HLTB single-game API** ([app/api/hltb/[appid]/route.ts](app/api/hltb/[appid]/route.ts)) — resolves one game for the authenticated user; used after an inline override edit to refresh a single row.
5. **HLTB overrides API** ([app/api/hltb/overrides/[appid]/route.ts](app/api/hltb/overrides/[appid]/route.ts)) — `PUT` saves or deletes a user-scoped fallback search-name override. Returns `409` if the appid already has a global direct mapping.
6. **Client merge** ([app/library/library-screen.tsx](app/library/library-screen.tsx)) — `useLibrary()` and `useHltb()` from [hooks/](hooks/), merged via `mergeGames` ([lib/library/merge.ts](lib/library/merge.ts)). Search + HLTB-range filter run as `useMemo` (no network). Filters persist in `localStorage` under `hltb-steam:library-filters`.

### HLTB resolution tiers

[lib/hltb/resolve.ts](lib/hltb/resolve.ts) implements a three-tier lookup, in order:

1. **Global Steam→HLTB mapping** (`hltb-map:steam-app:{appid}`) — populated from `hltb.fetchSteamImport(steamId)` which calls HLTB's `/api/steam/getSteamImportData`. Shared across all users. Only HLTB Steam import populates this; fuzzy search results are never written here.
2. **User-scoped override name** (`hltb-override-name:{steamId}:{appid}`) — edited inline in the table. Used only when no global mapping exists.
3. **Original Steam API name** — final fallback for rows without mapping or override.

After checking direct mappings for all library appids, the resolver consults a **library snapshot** (`hltb-library-snapshot:{steamId}`) to avoid calling HLTB Steam import on every request. Import is called when: snapshot is missing, snapshot is expired (12h TTL), or at least one unmapped appid is absent from the snapshot. If all appids already have mappings, import is skipped entirely.

The `HltbMeta` type in each response records how the match was found:

```ts
type HltbSource = 'steam-import' | 'override-name' | 'steam-name' | 'none'
type HltbMeta = { source: HltbSource; steamName: string; overrideName: string | null }
```

`source: 'steam-import'` rows are **read-only** in the UI. Only other sources are editable.

### Caching

Two layers, both important:

- **Server** — [lib/cache/kv.ts](lib/cache/kv.ts) uses `unstorage` with the fs-driver locally and `@vercel/functions` `getCache` on Vercel (detected via `process.env.VERCEL === '1'`). Values are wrapped as `Cached<T> = { value, cachedAt }`; expiry is checked on read via `isExpired()`. KV failures return `KvError` (never throw) — callers warn and continue without cache.
  - Library TTL: 1h
  - HLTB entry TTL: 7 days
  - HLTB library snapshot TTL: 12h
  - Global mappings: durable (no TTL applied at read time; treated as indefinite)
- **Client** — TanStack Query (`staleTime: 5min`, `gcTime: 24h`, `refetchOnWindowFocus: false`) with `PersistQueryClientProvider` writing to `localStorage` (24h max age, see [components/providers.tsx](components/providers.tsx)). The persister is initialized in `useEffect` because it needs `window`; before hydration we fall back to a plain `QueryClientProvider`.

KV cache key shapes:
- `library:{steamId}`
- `hltb-map:steam-app:{appid}`
- `hltb-entry:hltb-id:{hltbId}`
- `hltb-override-name:{steamId}:{appid}`
- `hltb-library-snapshot:{steamId}`

### HLTB client

[lib/hltb/client.ts](lib/hltb/client.ts) exposes three functions:

- `searchByName(name)` — calls `/api/bleed/init` then `/api/bleed`; needs the handshake to get token + `x-hp-*` headers or the API returns 403. Results scored in [lib/hltb/matcher.ts](lib/hltb/matcher.ts).
- `fetchSteamImport(steamId)` — calls `/api/steam/getSteamImportData`; returns `HltbSteamImportGame[]` mapping Steam appids to HLTB ids.
- `fetchById(hltbId)` — scrapes the HLTB Next.js `_next/data` route for completion times by HLTB id.

`normalizeName` in [lib/hltb/matcher.ts](lib/hltb/matcher.ts) strips `™®©`, edition suffixes, converts Roman→Arabic numerals, etc., and `pickBestMatch` blends string-similarity + token overlap; entries below threshold `0.6` are dropped to `null`. `normalizeName` is **no longer the HLTB cache key** — the cache now uses `hltbId` directly. (The old `hltb:v2:{name}` key has been removed.)

### Errors as values (`errore`)

Server-side library code returns `Error | T` instead of throwing. Tagged error classes live in [lib/errors.ts](lib/errors.ts):
- `SteamPrivateProfileError`, `SteamUnavailableError`
- `HltbFetchError`, `HltbRateLimitError`
- `KvError`
- `UnauthenticatedError`
- Client-facing: `LibraryFetchError`, `HltbApiError`

Pattern:

```ts
const games = await steam.getOwnedGames(steamId)
if (games instanceof Error) {
  return errore.matchError(games, {
    SteamPrivateProfileError: () => json(403, { error: 'private_profile' }),
    SteamUnavailableError: () => json(502, { error: 'steam_unavailable' }),
    Error: () => json(500, { error: 'internal' }),
  })
}
```

Client-side fetch helpers ([lib/client-fetch.ts](lib/client-fetch.ts)) **do throw** — that's the boundary into TanStack Query, which expects rejected promises. Don't return errors-as-values out of `queryFn`.

### Library table

[components/library-table/](components/library-table/) wraps `react-data-grid`. Sort state persists to `localStorage` ([use-persisted-sort-columns.ts](components/library-table/use-persisted-sort-columns.ts)); sort logic is custom and lives in [use-sorted-rows.ts](components/library-table/use-sorted-rows.ts) (column-key driven, nulls-last). Cell renderers are in `cells/`. The grid's own "no rows" fallback is disabled — empty state is rendered as an absolutely-positioned overlay so the header stays visible.

The `Name` column is **editable** for rows where `hltbMeta.source !== 'steam-import'`:
- `HltbSearchNameCell` displays the current search name and a reset button when an override is active.
- `HltbSearchNameEditor` is an inline text editor; `Enter` commits, `Escape` cancels, blur commits.
- Committing fires `onHltbSearchNameCommit(row, value)` in the library screen, which calls `saveHltbOverrideAndRefresh`.
- `savingAppids` (`ReadonlySet<number>`) tracks in-flight saves; the cell shows a spinner while saving.

### Override save flow

`saveHltbOverrideAndRefresh` in [hooks/use-hltb.ts](hooks/use-hltb.ts):

1. Optimistically update `meta[appid].overrideName` in the HLTB query cache.
2. `PUT /api/hltb/overrides/:appid` to persist the override.
3. `GET /api/hltb/:appid` to re-resolve the single row with the new name.
4. Merge the result back via `mergeSingleHltbResult`.
5. On error, roll back to the previous query data and re-throw (triggers `toast.error`).

### Refresh controls

[components/refresh-controls.tsx](components/refresh-controls.tsx) shows library and HLTB cache timestamps (via `date-fns/formatDistanceToNow`) and buttons that call `refreshLibrary` / `refreshHltb`. Both buttons share a 10s cooldown after either is clicked.

## Conventions worth knowing

- **Path alias**: `@/*` → repo root (`@/lib/...`, `@/components/...`). Configured in both [tsconfig.json](tsconfig.json) and [vitest.config.ts](vitest.config.ts).
- **React Compiler is on** ([next.config.ts](next.config.ts) `reactCompiler: true`, babel plugin in devDeps). Don't hand-write `useMemo`/`useCallback` purely for referential stability — the compiler handles it. Stable-key memoization for query keys is still needed because TanStack Query uses structural equality on the key.
- **shadcn config** in [components.json](components.json): `radix-nova` style, neutral base, lucide icons. New UI primitives go in `components/ui/`; everything else in `components/`.
- **Test layout** mirrors source: `tests/lib/...` ↔ `lib/...`, `tests/components/...` ↔ `components/...`. Keep that pairing.
- **Specs and plans** for major work live in `docs/superpowers/specs/` and `docs/superpowers/plans/`. Read the matching spec before re-architecting the feature it covers.
- **Deploy target**: Vercel. `pnpm deploy` / `pnpm deploy:prod`. Locally the fs-driver cache assumes a writable filesystem; on Vercel it switches to `@vercel/functions` `getCache` automatically.
- **HLTB cache key migration**: The old name-based cache key `hltb:v2:{normalizeName(name)}` has been removed. The authoritative path is global mapping (`hltb-map:steam-app:*`) + HLTB entry by id (`hltb-entry:hltb-id:*`). Do not re-introduce name-based HLTB caching.
- **Editability is derived from `source`**: Never add a separate `editable` flag; always use `meta.source !== 'steam-import'` to determine if a row is editable.
