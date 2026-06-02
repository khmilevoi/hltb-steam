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

export type HltbSource = 'steam-import' | 'override-name' | 'steam-name' | 'none'

export type HltbMeta = {
  source: HltbSource
  steamName: string
  overrideName: string | null
}

export type HltbSyncReason =
  | 'none'
  | 'library-cache-missing'
  | 'missing-hltb-data'
  | 'stale-hltb-data'

export type HltbSyncMeta = {
  needed: boolean
  reason: HltbSyncReason
  missingAppids: number[]
  staleAppids: number[]
  cachedCount: number
  totalCount: number
}

export type HltbStateResponse = {
  revision: string
  updatedAt: string
}

export type HltbUserState = HltbStateResponse

export type HltbFallbackResult = {
  appid: number
  searchName: string
  entry: HltbEntry | null
  source: 'override-name' | 'steam-name' | 'none'
}

export type HltbResponse = {
  entries: Record<number, HltbEntry | null>
  cachedAt: Record<number, string | null>
  meta: Record<number, HltbMeta>
  sync: HltbSyncMeta
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

export type Cached<T> = { value: T; cachedAt: string }

export type SortField =
  | 'name'
  | 'steamHours'
  | 'hltbMain'
  | 'hltbMainExtra'
  | 'hltbCompletionist'

export type SortDirection = 'asc' | 'desc'
