# HLTB Steam ID Mapping And Overrides - Design Spec

**Date:** 2026-05-24
**Status:** Approved (brainstorm)
**Author:** brainstorming session

## 1. Summary

Improve HLTB matching by introducing a shared `Steam appid -> HLTB id` mapping layer, populated from HLTB's Steam import endpoint. The app should first resolve games by direct mapping, then fall back to user-specific search-name overrides, then to the original Steam API name. Users can edit fallback search names inline in the table only for games that do not have a direct mapping.

This keeps high-confidence mappings global while keeping subjective/manual search-name corrections scoped to one Steam user.

## 2. Goals

- Prefer direct `Steam appid -> HLTB id` lookups over name search.
- Populate the direct mapping from HLTB Steam import data for any public Steam library.
- Share direct mappings globally across users.
- Store manual fallback search-name overrides per `steamId + appid`.
- Make only non-direct-mapped rows editable in the library table.
- Let users reset an override back to the original Steam API name.
- Avoid sending the game list from the client to `/api/hltb`; the HLTB endpoint owns library loading server-side.
- Track each user's library appid snapshot so HLTB Steam import is only refreshed when useful.

## 3. Non-Goals

- A fully official HLTB integration. HLTB does not provide a stable public API; this feature uses undocumented endpoints with fallbacks.
- User editing of rows resolved by direct global mapping.
- Automatically promoting fuzzy/name-search results to global direct mappings.
- A remote database or multi-machine cache. This remains local fs-backed `unstorage`.
- Background jobs or scheduled automation. Refresh happens during user-driven requests.

## 4. Data Ownership

The feature uses four separate persistence concepts.

### Global Mapping

`hltb-map:steam-app:{appid}`

```ts
type HltbSteamMapping = {
  steamAppId: number
  hltbId: number
  hltbName: string
  discoveredFromSteamId: string
  discoveredAt: string
}
```

This mapping is shared by all users. It is populated only from HLTB Steam import responses because that endpoint returns explicit `steam_id -> hltb_id` pairs. Name search results are not written to this mapping to avoid spreading fuzzy-match mistakes globally.

### HLTB Entry Cache

`hltb-entry:hltb-id:{hltbId}`

```ts
type CachedHltbEntry = HltbEntry
```

The actual HLTB completion data is cached by HLTB id, not Steam appid. This avoids duplicate storage when multiple Steam appids point at the same HLTB page.

### User Override Names

`hltb-override-name:{steamId}:{appid}`

```ts
type HltbOverrideName = {
  appid: number
  searchName: string
  updatedAt: string
}
```

Overrides are user-scoped. They are used only when no global direct mapping exists for the appid.

If a global mapping is discovered later for an appid that already has a user override, the mapping wins and the override is ignored. The implementation may delete that now-dormant override opportunistically, but lookup correctness must not depend on cleanup.

### Library Snapshot

`hltb-library-snapshot:{steamId}`

```ts
type HltbLibrarySnapshot = {
  appids: number[]
  refreshedAt: string
}
```

The snapshot records which user-library appids were covered by the last HLTB Steam import attempt. It is only consulted after the server has checked the global mapping cache and found appids that still have no direct mapping.

## 5. Lookup Flow

`GET /api/hltb` is server-owned. It does not accept a client-submitted game list.

1. Authenticate via `auth()` and read `session.user.steamId`.
2. Load the Steam library through a shared server helper:

```ts
loadUserLibrary({ steamId, force }): Promise<{
  games: SteamGame[]
  cachedAt: string | null
}>
```

3. Batch-check global mappings for all current library appids.
4. If every current appid already has a global mapping, skip HLTB Steam import regardless of snapshot state.
5. If some appids have no global mapping, compare only those unmapped appids with `hltb-library-snapshot:{steamId}`.
6. Call HLTB Steam import with `steamId` only when unmapped appids exist and at least one of these is true:
   - the snapshot is missing;
   - the snapshot is expired;
   - at least one unmapped appid is absent from the snapshot.
7. For every import game with `steam_id` and `hltb_id`, write or update the global mapping.
8. After an import attempt, update the user's library snapshot to the current appid list. If import fails, keep the previous snapshot so the next eligible request can retry.
9. Re-check global mappings for appids that were missing before import.
10. For every game in the current library, resolve HLTB data in this priority order:
   - If global mapping exists, load HLTB entry by `hltbId`.
   - If entry cache misses, fetch HLTB game details by HLTB id and cache the entry.
   - If no global mapping exists, read user override name.
   - If override exists, search HLTB by override name.
   - Otherwise, search HLTB by the original Steam API name.
11. If no result is found for a game, return `null` for that appid.

HLTB Steam import failures do not fail the whole endpoint. The server continues with existing mappings and name-search fallback.

## 6. API Contracts

### `GET /api/hltb?force=0|1`

Returns HLTB data for the current authenticated user's Steam library.

```ts
type HltbSource = 'steam-import' | 'override-name' | 'steam-name' | 'none'

type HltbMeta = {
  source: HltbSource
  editable: boolean
  steamName: string
  overrideName: string | null
  effectiveSearchName: string
}

type HltbResponse = {
  entries: Record<number, HltbEntry | null>
  cachedAt: Record<number, string | null>
  meta: Record<number, HltbMeta>
}
```

Rules:

- `editable` is `false` when a global direct mapping exists.
- `editable` is `true` when resolution used override name, Steam name, or returned `none`.
- If a global direct mapping exists but HLTB detail loading fails, return `entries[appid] = null` with `source: 'steam-import'` and `editable: false`. The row remains non-editable because the direct mapping still exists.
- If fallback search by override name or Steam name was attempted but produced no match, return `entries[appid] = null` with `source: 'none'`. The attempted name remains visible through `effectiveSearchName`.
- `overrideName !== null` tells the UI an override exists; no separate `hasOverride` flag is needed.
- `effectiveSearchName` is the name used for fallback lookup: `overrideName ?? steamName`.
- `force=1` bypasses HLTB entry/name-search caches for the returned appids, but does not force a Steam library refresh and does not force HLTB Steam import unless the snapshot policy requires it. It still preserves the same lookup priority.

### `GET /api/hltb/:appid`

Returns the same `entry`, `cachedAt`, and `meta` shape for one appid in the current authenticated user's library. This is used after inline edits so the client can refresh one row without fetching the full batch.

If the appid is not in the user's current Steam library, return `404`.

### `GET /api/hltb/overrides`

Returns all search-name overrides for the current user.

```ts
type HltbOverridesResponse = {
  overrides: Record<number, string>
}
```

### `PUT /api/hltb/overrides/:appid`

Creates, updates, or deletes a user-scoped fallback search-name override.

Request:

```ts
type PutHltbOverrideRequest = {
  searchName: string | null
}
```

Rules:

- Requires an authenticated Steam session.
- Validates `appid` as a positive integer.
- If the valid `appid` is not in the current user's Steam library, return `404`. Overrides are only valid for games in the user's library because reset comparisons require the original Steam API name.
- If the appid already has a global direct mapping, return `409` with an error such as `mapping_exists`. Overrides are not stored for direct-mapped rows.
- If `searchName` is `null` or trims to an empty string, delete the override.
- If trimmed `searchName` equals the original Steam API name, delete the override.
- Otherwise store the trimmed value at `hltb-override-name:{steamId}:{appid}`.
- The client then refreshes `GET /api/hltb/:appid` or invalidates the full HLTB query.

## 7. UI Behavior

The library table adds an editable HLTB search-name column, or extends an existing match/name column to show this data.

Use `react-data-grid` editing support:

- `isCellEditable` returns `true` only when `meta[appid].editable` is true.
- Direct-mapped rows are readonly and show the matched HLTB name/status.
- Fallback rows show the effective search name and can be edited inline.
- Committing an edit calls `PUT /api/hltb/overrides/:appid`.
- If the committed value equals the Steam name or is blank after trim, it resets the override.
- Pressing Escape cancels the local grid edit.
- A compact reset control is shown only when `overrideName !== null`.
- After save/reset, refresh only that row when practical through `GET /api/hltb/:appid`; otherwise invalidate the full HLTB query.

The UI never mutates the Steam API name. It only edits the user-scoped fallback search-name override.

## 8. Caching And Refresh Policy

The server should first check global direct mappings for all current library appids. Only appids without mapping can trigger HLTB Steam import or fallback name lookup.

The library snapshot gates Steam import calls only after unmapped appids are known:

- If all current appids already have global mappings, skip HLTB Steam import.
- If unmapped appids exist and there is no snapshot, call HLTB Steam import.
- If unmapped appids exist and the snapshot is expired, call HLTB Steam import.
- If unmapped appids exist and at least one unmapped appid is absent from the snapshot, call HLTB Steam import.
- If unmapped appids exist but the snapshot is fresh and already covers those appids, skip Steam import and use fallback lookup.
- Manual library refresh should force a fresh Steam library load, then run the same mapping-first import policy.
- Manual HLTB refresh should call `GET /api/hltb?force=1`; this refreshes HLTB enrichment data for current appids but still uses the cached Steam library unless the library endpoint was separately refreshed.

Even when Steam import is skipped, lookup still checks the global mapping cache first. This means mappings discovered from other users can benefit the current user immediately.

Suggested TTLs:

- HLTB entry cache: 7 days, matching the existing HLTB cache behavior.
- Library snapshot freshness: 6 to 24 hours. The exact value can be chosen during implementation, but it should prevent repeated import calls on every page load.
- Global mapping entries do not need a short TTL. They can be treated as durable unless the implementation later adds explicit invalidation.

## 9. Error Handling

- HLTB Steam import failure logs a warning and falls back to existing mappings and name search.
- HLTB detail-by-id failure returns `null` for that appid and keeps the global mapping.
- Name search failure returns `null` with `source: 'none'`, `editable: true`, and complete name metadata.
- KV read/write failures are logged and should not fail the entire screen, matching the existing cache behavior.
- Override save failure should revert local UI state and show a toast.
- Authentication failures return `401`.
- Invalid appid or body payloads return `400`.
- A single HLTB failure must not fail the whole batch.

## 10. Test Strategy

Add focused tests around the new boundaries:

- KV helpers for global mapping, HLTB entry by id, overrides, and library snapshot.
- Lookup priority:
  - global mapping wins over override and Steam name;
  - override name wins over Steam name when no mapping exists;
  - Steam name is used when no mapping or override exists;
  - missing result returns `null` with editable metadata.
- Snapshot policy:
  - Steam import is skipped when all appids already have global mappings;
  - Steam import runs when unmapped appids exist and snapshot is missing;
  - Steam import runs when unmapped appids exist and snapshot is expired;
  - Steam import runs when an unmapped appid is absent from the snapshot;
  - Steam import is skipped when unmapped appids exist but snapshot is fresh and already covers them.
- Route behavior for:
  - `GET /api/hltb`;
  - `GET /api/hltb/:appid`;
  - `GET /api/hltb/overrides`;
  - `PUT /api/hltb/overrides/:appid`.
- Component behavior for the editable grid cell:
  - readonly with global mapping;
  - editable without global mapping;
  - commit saves override;
  - blank or Steam-name commit resets override;
  - reset control is visible only when `overrideName !== null`.

## 11. Implementation Notes

- The current `/api/hltb` route accepts `{ games }`; this design replaces it with server-owned library loading.
- The current name-based HLTB cache key, `hltb:v2:{normalizeName(name)}`, should not remain the final authoritative cache for appid resolution. It may be kept temporarily as a compatibility/fallback cache during migration, but the new authoritative path is global mapping plus HLTB entry cache by `hltbId`.
- `HltbEntry` already contains `hltbId` and `matchedName`, which fits the new entry cache.
- Direct mapping should be populated only from HLTB Steam import. Fuzzy search should not update the global mapping automatically.
- Existing `errore` error-as-values conventions should be preserved in `lib/*`; client fetch helpers may continue throwing at TanStack Query boundaries.

## 12. Planning Decisions

- Exact library snapshot TTL can be chosen during implementation planning, likely 6 to 24 hours.
- `GET /api/hltb/:appid` should use the shared library helper without forcing a fresh Steam library read. If a caller needs fresh library membership, it should refresh `/api/library` first.
