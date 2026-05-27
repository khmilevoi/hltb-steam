# HLTB Cached Endpoint - Design Spec

**Date:** 2026-05-27
**Status:** Approved (brainstorm)
**Author:** brainstorming session

## 1. Summary

Add a fast read-only `GET /api/hltb/cached` endpoint that returns only HLTB data already present in the server cache. Add a lighter `GET /api/hltb/state` endpoint that lets each device check whether its persisted local HLTB cache is still current before fetching larger cached payloads or running full sync. The existing `GET /api/hltb` remains the synchronization endpoint that may call Steam and HLTB, fill missing cache entries, and return refreshed results.

This separates "show what we already know" from "perform slow enrichment" so a new device can render the library table quickly while missing HLTB data syncs afterward.

## 2. Goals

- Make first load on a new device fast when the server already has usable cached HLTB data.
- Ensure `GET /api/hltb/cached` never calls external Steam or HLTB APIs.
- Ensure `GET /api/hltb/state` is a cheap KV-only revision check.
- Detect cross-device override changes without running full HLTB refresh.
- Let the client automatically run `GET /api/hltb` when cached data reports that synchronization is needed.
- Make the manual Refresh HLTB button check local cache freshness first, then use cached data, and only run full sync if needed.
- Preserve visible cached HLTB values while sync is running.
- Return enough sync metadata for the UI and tests to know why a sync is needed.

## 3. Non-Goals

- Synchronizing browser `localStorage` between devices.
- Adding background jobs or scheduled cache warmers.
- Replacing the existing server-owned `/api/hltb` model.
- Changing Steam library refresh semantics beyond avoiding live Steam calls from the cached endpoint.

## 4. API Contracts

### `GET /api/hltb/cached`

Returns the current user's cached HLTB data for the cached Steam library.

Hard rule: this endpoint reads only server KV. It must not call:

- Steam `GetOwnedGames`;
- HLTB Steam import;
- HLTB detail lookup by id;
- HLTB name search.

Response:

```ts
type HltbSyncMeta = {
  needed: boolean
  reason:
    | 'none'
    | 'library-cache-missing'
    | 'missing-hltb-data'
    | 'stale-hltb-data'
  missingAppids: number[]
  staleAppids: number[]
  cachedCount: number
  totalCount: number
}

type HltbResponse = {
  entries: Record<number, HltbEntry | null>
  cachedAt: Record<number, string | null>
  meta: Record<number, HltbMeta>
  sync: HltbSyncMeta
}
```

If the cached Steam library is missing or expired, return an empty HLTB payload with:

```ts
sync: {
  needed: true,
  reason: 'library-cache-missing',
  missingAppids: [],
  staleAppids: [],
  cachedCount: 0,
  totalCount: 0,
}
```

This keeps `/api/hltb/cached` fast even when Steam is slow or unavailable.

### `GET /api/hltb/state`

Returns a compact revision marker for the current user's server-side HLTB state.

Hard rule: this endpoint reads only server KV. It must not read the full Steam library and must not call Steam or HLTB.

Response:

```ts
type HltbStateResponse = {
  revision: string
  updatedAt: string
}
```

The revision must change when user-visible cached HLTB state can change for the signed-in Steam account, including:

- override create/update/delete;
- fallback result cache changes for that user's appids;
- full HLTB sync writes that can affect visible entries or metadata for that user.

The endpoint is used to decide whether a device's persisted TanStack Query cache can remain trusted. Matching revision means the client can skip `/api/hltb/cached` and `/api/hltb`. Different revision means the client should fetch `/api/hltb/cached`, merge the server KV view into local query cache, and only then run full sync if `sync.needed` is true.

### `GET /api/hltb`

Keeps the existing role as the full sync endpoint.

It may:

- load the Steam library through the existing server helper;
- call HLTB Steam import when mapping refresh policy requires it;
- call HLTB detail lookup for missing mapped entries;
- call fallback HLTB name search when no mapping exists;
- write mappings, entries, fallback results, and snapshots to KV.

After a successful full sync for the current library, it should return:

```ts
sync: {
  needed: false,
  reason: 'none',
  missingAppids: [],
  staleAppids: [],
  cachedCount: totalCount,
  totalCount,
}
```

Partial HLTB failures still return per-row `null` entries instead of failing the whole batch. Explicitly cached `null` results count as cached final state.

## 5. When `sync.needed` Is True

`sync.needed` means the cached endpoint could not assemble final HLTB state for the currently cached Steam library.

It is true when any of these are true:

- the server has no usable cached Steam library;
- an appid has no global mapping and no valid cached fallback result;
- an appid has a global mapping, but its `hltb-entry:hltb-id:{hltbId}` entry is missing;
- a required mapping, entry, or fallback result is stale by TTL policy.

It is false when every appid has one of these final cached states:

- a valid HLTB entry;
- an explicitly cached `null` result meaning no HLTB match was found;
- a valid fallback cache result for an unmapped appid.

## 6. Data Ownership

The existing shared mapping and entry caches remain authoritative:

- `hltb-map:steam-app:{appid}`
- `hltb-entry:hltb-id:{hltbId}`
- `hltb-override-name:{steamId}:{appid}`
- `hltb-library-snapshot:{steamId}`

Add a per-user state revision:

```txt
hltb-user-state:{steamId}
```

```ts
type HltbUserState = {
  revision: string
  updatedAt: string
}
```

The revision can be a timestamp plus random suffix, a monotonic counter, or another opaque string. Clients must compare it only for equality.

Update this state after any successful server mutation that should invalidate local HLTB query caches on other devices. Override mutations must update it even if no full HLTB sync runs.

Add a fallback-result cache for unmapped rows:

```ts
type HltbFallbackResult = {
  appid: number
  searchName: string
  entry: HltbEntry | null
  source: 'override-name' | 'steam-name' | 'none'
}
```

Suggested key:

```txt
hltb-fallback-result:{steamId}:{appid}
```

The fallback key is user-scoped because override names are user-scoped. The implementation can later add a secondary normalized-name cache, but the first version should keep ownership simple and avoid accidentally sharing fuzzy matches globally.

## 7. Client Flow

1. `useLibrary()` calls `GET /api/library`.
2. The table renders Steam rows as soon as the library is available.
3. The client calls `GET /api/hltb/state`.
4. If the server revision matches the revision stored with the persisted local HLTB response, the client reuses local data and skips larger HLTB requests.
5. If the revision differs or local HLTB data is absent, `useHltbCached()` calls `GET /api/hltb/cached`.
6. The table renders cached HLTB values immediately.
7. If `sync.needed === true`, the client automatically starts `GET /api/hltb`.
8. The Refresh HLTB button first calls `GET /api/hltb/state`. If revision changed, it calls `/api/hltb/cached`; it calls full `/api/hltb` only when the cached response reports `sync.needed`.
9. During sync, cached values stay visible; only missing/stale HLTB cells show loading.
10. When sync finishes, the UI merges or replaces HLTB data with the full response and stores the latest revision.

Use separate query identities for cached and sync requests, but expose one derived HLTB state to the table.

```ts
const HLTB_CACHED_QUERY_KEY = ['hltb', 'cached'] as const
const HLTB_SYNC_QUERY_KEY = ['hltb', 'sync'] as const
const HLTB_STATE_QUERY_KEY = ['hltb', 'state'] as const
```

## 8. Sequence Diagram

```mermaid
sequenceDiagram
    participant UI as LibraryScreen
    participant LQ as useLibrary()
    participant API_L as GET /api/library
    participant KV as Server KV
    participant Steam as Steam API
    participant ST as useHltbState()
    participant API_S as GET /api/hltb/state
    participant CQ as useHltbCached()
    participant API_C as GET /api/hltb/cached
    participant SQ as syncHltb()
    participant API_H as GET /api/hltb
    participant HLTB as HLTB API

    UI->>LQ: mount
    LQ->>API_L: fetch library
    API_L->>KV: get library:{steamId}

    alt library cache hit
        KV-->>API_L: cached games
    else library cache miss/expired
        API_L->>Steam: GetOwnedGames
        Steam-->>API_L: games
        API_L->>KV: set library:{steamId}
    end

    API_L-->>LQ: games
    LQ-->>UI: render Steam rows

    UI->>ST: enabled after library loaded
    ST->>API_S: fetch HLTB state
    API_S->>KV: get hltb-user-state:{steamId}
    KV-->>API_S: revision
    API_S-->>ST: revision + updatedAt

    alt local revision matches
        ST-->>UI: keep persisted HLTB data
    else local revision missing or differs
        UI->>CQ: fetch cached server HLTB
        CQ->>API_C: GET /api/hltb/cached
        API_C->>KV: get cached library only

        alt cached library missing
            API_C-->>CQ: sync.needed = true, reason = library-cache-missing
        else cached library exists
            loop each appid
                API_C->>KV: get hltb-map / hltb-entry / fallback-result
                KV-->>API_C: cached HLTB data or missing
            end
            API_C-->>CQ: partial entries + sync metadata
        end

        CQ-->>UI: render cached HLTB values
    end

    alt sync.needed == true
        UI->>SQ: auto sync
        SQ->>API_H: GET /api/hltb
        API_H->>KV: get library:{steamId}

        alt library cache hit
            KV-->>API_H: cached games
        else library cache miss/expired
            API_H->>Steam: GetOwnedGames
            Steam-->>API_H: games
            API_H->>KV: set library:{steamId}
        end

        API_H->>KV: read existing mappings/entries/fallbacks

        alt mappings missing
            API_H->>HLTB: Steam import
            HLTB-->>API_H: steam appid -> hltb id mappings
            API_H->>KV: set hltb-map entries
        end

        loop missing/stale appids
            alt has hltb mapping but missing entry
                API_H->>HLTB: fetchById(hltbId)
                HLTB-->>API_H: HLTB entry/null
                API_H->>KV: set hltb-entry
            else no mapping and missing fallback result
                API_H->>HLTB: searchByName(name/override)
                HLTB-->>API_H: HLTB entry/null
                API_H->>KV: set fallback result
            end
        end

        API_H-->>SQ: full HLTB response, sync.needed = false
        SQ-->>UI: merge/replace HLTB data and revision
    else sync.needed == false
        UI->>UI: no background sync
    end

    opt user clicks Refresh HLTB
        UI->>ST: manual state check
        ST->>API_S: GET /api/hltb/state
        API_S->>KV: get hltb-user-state:{steamId}
        API_S-->>ST: revision + updatedAt

        alt revision changed
            UI->>CQ: fetch cached server HLTB
            CQ->>API_C: GET /api/hltb/cached
            API_C->>KV: read cached HLTB state
            API_C-->>CQ: cached response + sync metadata
            CQ-->>UI: merge cached response
        end

        alt cached response says sync needed
            UI->>SQ: manual sync
            SQ->>API_H: GET /api/hltb
            API_H->>KV: read cache, refresh missing/stale
            API_H->>HLTB: external requests only if needed
            API_H-->>SQ: refreshed HLTB response
            SQ-->>UI: merge/replace HLTB data and revision
        else revision unchanged and sync not needed
            UI->>UI: no full HLTB refresh
        end
    end
```

## 9. Error Handling

- Authentication failures return `401`.
- Missing cached library in `/api/hltb/cached` returns `200` with `sync.needed = true`, not an error.
- Missing user state in `/api/hltb/state` should initialize and return a valid revision.
- KV read failures in `/api/hltb/cached` should be logged and treated as missing cached data for that row.
- External HLTB failures remain isolated per row in `/api/hltb`.
- Sync failure should show a toast while preserving cached values already rendered.

## 10. Test Strategy

- Route test: `GET /api/hltb/cached` does not call Steam or HLTB client functions.
- Route test: `GET /api/hltb/state` does not call Steam, HLTB, or full library loading.
- Route test: override create/update/delete changes `hltb-user-state:{steamId}` revision.
- Route test: missing library cache returns `sync.needed = true` with `reason = 'library-cache-missing'`.
- Resolver test: mapping plus cached entry returns `needed = false`.
- Resolver test: mapping without cached entry returns `needed = true` and includes the appid in `missingAppids`.
- Resolver test: unmapped appid with cached fallback `null` returns `needed = false`.
- Resolver test: unmapped appid without fallback result returns `needed = true`.
- Client test: cached values render before sync completes.
- Client test: matching state revision reuses persisted local HLTB data without cached/full HLTB fetch.
- Client test: changed state revision fetches `/api/hltb/cached` and updates visible override metadata quickly.
- Client test: auto sync starts when cached response has `sync.needed = true`.
- Client test: Refresh HLTB skips full sync when state matches and cached data does not need sync.
- Client test: Refresh HLTB fetches cached data when state changed, then full sync only if needed.
- Client test: cached table values are not cleared while sync is pending.

## 11. Planning Decisions

- Use a separate `/api/hltb/cached` route instead of `?cacheFirst=1`.
- Add `/api/hltb/state` so devices can cheaply detect cross-device override changes before fetching larger HLTB payloads.
- Auto sync uses the existing `/api/hltb` sync route only after cached data reports `sync.needed`.
- Manual Refresh HLTB first checks state and cached data; it uses `/api/hltb` only when sync is still needed.
- The cached endpoint must not live-load Steam library data; it reads cached library only.
- Explicitly cached `null` HLTB results are final cached state and must not cause endless sync.
