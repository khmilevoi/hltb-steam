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
