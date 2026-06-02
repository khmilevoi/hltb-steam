import type { HltbSyncMeta, HltbSyncReason } from '@/types/game'

export function noSyncNeeded(totalCount: number): HltbSyncMeta {
  return {
    needed: false,
    reason: 'none',
    missingAppids: [],
    staleAppids: [],
    cachedCount: totalCount,
    totalCount,
  }
}

export function libraryCacheMissingSync(): HltbSyncMeta {
  return {
    needed: true,
    reason: 'library-cache-missing',
    missingAppids: [],
    staleAppids: [],
    cachedCount: 0,
    totalCount: 0,
  }
}

export function cachedSyncMeta({
  cachedCount,
  missingAppids,
  staleAppids,
  totalCount,
}: {
  cachedCount: number
  missingAppids: number[]
  staleAppids: number[]
  totalCount: number
}): HltbSyncMeta {
  const needed = missingAppids.length > 0 || staleAppids.length > 0
  const reason: HltbSyncReason = !needed
    ? 'none'
    : staleAppids.length > 0
      ? 'stale-hltb-data'
      : 'missing-hltb-data'

  return { needed, reason, missingAppids, staleAppids, cachedCount, totalCount }
}
