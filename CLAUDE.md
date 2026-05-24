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
```

Vitest uses `jsdom` and only picks up `tests/**/*.test.{ts,tsx}` (see [vitest.config.ts](vitest.config.ts)). `tests/setup.ts` injects placeholder env vars so `lib/env.ts` parses during tests — never write tests that hit real Steam/HLTB.

Required env (`.env.local`): `STEAM_API_KEY`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`. Parsed and validated at module load by [lib/env.ts](lib/env.ts) — importing anything that touches it without these set will throw.

The local server cache lives in `.cache/` (gitignored). Delete it to wipe Steam library and HLTB results.

## Architecture

### Request flow

Steam OpenID sign-in → JWT stores `steamId` → client fetches library + HLTB through own API routes → results merged client-side by `appid`.

1. **Auth** ([auth.ts](auth.ts), [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts)) — `next-auth-steam` provider with custom JWT/session callbacks that surface `session.user.steamId`. `getAuthOptions(req)` is request-scoped because the Steam provider needs the incoming Request; the top-level `authOptions` uses a fallback request only for `auth()` server-side calls.
2. **Library API** ([app/api/library/route.ts](app/api/library/route.ts)) — `auth()` gate → cache lookup → Steam `IPlayerService/GetOwnedGames` → cache write. Empty `games` array from Steam means private profile (returns 403 `private_profile`), translated client-side to `LibraryFetchError` with `code: 'private_profile'`.
3. **HLTB API** ([app/api/hltb/route.ts](app/api/hltb/route.ts)) — accepts batch `{games: [{appid, name}]}`, runs lookups through `pLimit(5)`, each name independently cached. Per-name failures are swallowed to `null` (logged via `console.warn`) so one bad lookup doesn't poison the batch.
4. **Client merge** ([app/library/library-screen.tsx](app/library/library-screen.tsx)) — `useLibrary()` and `useHltb({games})` from [hooks/](hooks/), merged via `mergeGames` ([lib/library/merge.ts](lib/library/merge.ts)). Search + HLTB-range filter run as `useMemo` (no network). Filters persist in `localStorage` under `hltb-steam:library-filters`.

### Caching

Two layers, both important:

- **Server** — [lib/cache/kv.ts](lib/cache/kv.ts) uses `unstorage` with the fs-driver pointed at `.cache/`. Library TTL = 1h, HLTB TTL = 7 days. Values are wrapped as `Cached<T> = { value, cachedAt }`; expiry is checked on read, not on a timer. KV failures return `KvError` (never throw) — callers warn and continue without cache.
- **Client** — TanStack Query (`staleTime: 5min`, `gcTime: 24h`, `refetchOnWindowFocus: false`) with `PersistQueryClientProvider` writing to `localStorage` (24h max age, see [components/providers.tsx](components/providers.tsx)). The persister is initialized in `useEffect` because it needs `window`; before hydration we fall back to a plain `QueryClientProvider`.

### HLTB matching

[lib/hltb/client.ts](lib/hltb/client.ts) calls `howlongtobeat.com/api/bleed/init` then `/api/bleed` to get a fresh token + `x-hp-*` headers per search — without that handshake the API returns 403. Results are scored against the Steam name in [lib/hltb/matcher.ts](lib/hltb/matcher.ts) (`normalizeName` strips `™®©`, edition suffixes, converts Roman→Arabic numerals, etc., then `pickBestMatch` blends string-similarity + token overlap; entries below threshold `0.6` are dropped to `null`). `normalizeName` is also the HLTB cache key — changing it invalidates everything cached under the old format, so bump the key prefix (`hltb:v2:`) if you change normalization.

### Errors as values (`errore`)

Server-side library code returns `Error | T` instead of throwing. Tagged error classes live in [lib/errors.ts](lib/errors.ts) (`SteamPrivateProfileError`, `SteamUnavailableError`, `HltbFetchError`, `HltbRateLimitError`, `KvError`, plus client-facing `LibraryFetchError`/`HltbApiError`). Pattern:

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

## Conventions worth knowing

- **Path alias**: `@/*` → repo root (`@/lib/...`, `@/components/...`). Configured in both [tsconfig.json](tsconfig.json) and [vitest.config.ts](vitest.config.ts).
- **React Compiler is on** ([next.config.ts](next.config.ts) `reactCompiler: true`, babel plugin in devDeps). Don't hand-write `useMemo`/`useCallback` purely for referential stability — the compiler handles it. Stable-key memoization for query keys (e.g. [hooks/use-hltb.ts](hooks/use-hltb.ts) `appids`) is still needed because TanStack Query uses structural equality on the key.
- **shadcn config** in [components.json](components.json): `radix-nova` style, neutral base, lucide icons. New UI primitives go in `components/ui/`; everything else in `components/`.
- **Test layout** mirrors source: `tests/lib/...` ↔ `lib/...`, `tests/components/...` ↔ `components/...`. Keep that pairing.
- **Specs and plans** for major work live in `docs/superpowers/specs/` and `docs/superpowers/plans/`. Read the matching spec before re-architecting the feature it covers.
- **No deploy target**: this project is local-only (no `vercel.json` / `vercel.ts`, no deploy scripts). The fs-driver cache assumes a writable local filesystem.
