import { HltbFetchError, HltbRateLimitError } from '@/lib/errors'
import { pickBestMatch, type HltbCandidate } from '@/lib/hltb/matcher'
import type { HltbEntry } from '@/types/game'

const HLTB_BASE_URL = 'https://howlongtobeat.com'
const SEARCH_SIZE = 20

const baseHeaders = {
  Accept: 'application/json, text/plain, */*',
  Origin: HLTB_BASE_URL,
  Referer: `${HLTB_BASE_URL}/`,
  'User-Agent': 'Mozilla/5.0',
}

type RawHltbResult = {
  game_id: string | number
  game_name: string
  comp_main?: number
  comp_plus?: number
  comp_100?: number
}

type HltbSteamImportResponse = {
  error?: unknown
  games?: unknown[]
}

type NextGameResponse = {
  pageProps?: {
    game?: {
      data?: {
        game?: RawHltbResult[]
      }
    }
  }
}

export type HltbSteamImportGame = {
  steamAppId: number
  hltbId: number
  hltbName: string
}

function toCandidate(result: RawHltbResult): HltbCandidate {
  const num = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
  const secondsToHours = (value: unknown) => {
    const seconds = num(value)
    return seconds === null ? null : Math.round(seconds / 60) / 60
  }

  return {
    id: Number(result.game_id),
    name: result.game_name,
    main: secondsToHours(result.comp_main),
    mainExtra: secondsToHours(result.comp_plus),
    completionist: secondsToHours(result.comp_100),
  }
}

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

type BleedInit = {
  token?: string
  hpKey?: string
  hpVal?: string
}

type BleedSearch = {
  data?: RawHltbResult[]
}

async function readJson<T>(response: Response): Promise<T | HltbFetchError | HltbRateLimitError> {
  if (response.status === 429) {
    return new HltbRateLimitError({ retryAfterMs: 10_000 })
  }

  if (!response.ok) {
    return new HltbFetchError({ name: 'HLTB', reason: `HTTP ${response.status}` })
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    return new HltbFetchError({ name: 'HLTB', reason: 'invalid JSON response', cause: error })
  }
}

async function initSearch(): Promise<BleedInit | HltbFetchError | HltbRateLimitError> {
  try {
    const response = await fetch(`${HLTB_BASE_URL}/api/bleed/init?t=${Date.now()}`, {
      cache: 'no-store',
      headers: baseHeaders,
    })
    const init = await readJson<BleedInit>(response)
    if (init instanceof Error) return init
    if (!init.token) {
      return new HltbFetchError({ name: 'HLTB', reason: 'missing search token' })
    }
    return init
  } catch (error) {
    return new HltbFetchError({ name: 'HLTB', reason: 'search init threw', cause: error })
  }
}

function searchPayload(name: string, init: BleedInit) {
  const payload: Record<string, unknown> = {
    searchType: 'games',
    searchTerms: name.trim().split(/\s+/).filter(Boolean),
    searchPage: 1,
    size: SEARCH_SIZE,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  }

  if (init.hpKey) payload[init.hpKey] = init.hpVal ?? ''
  return payload
}

export async function searchByName(
  name: string,
): Promise<HltbRateLimitError | HltbFetchError | HltbEntry | null> {
  const init = await initSearch()
  if (init instanceof Error) return init

  let search: BleedSearch | HltbFetchError | HltbRateLimitError
  try {
    const response = await fetch(`${HLTB_BASE_URL}/api/bleed`, {
      body: JSON.stringify(searchPayload(name, init)),
      cache: 'no-store',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
        'x-auth-token': init.token ?? '',
        'x-hp-key': init.hpKey ?? '',
        'x-hp-val': init.hpVal ?? '',
      },
      method: 'POST',
    })
    search = await readJson<BleedSearch>(response)
  } catch (error) {
    return new HltbFetchError({ name, reason: 'search threw', cause: error })
  }

  if (search instanceof Error) return search
  if (!Array.isArray(search.data) || search.data.length === 0) return null
  const candidates = search.data.map(toCandidate)
  return pickBestMatch(candidates, name)
}

function toImportGame(row: unknown): HltbSteamImportGame | null {
  if (typeof row !== 'object' || row === null) return null
  const value = row as Record<string, unknown>
  const steamAppId = Number(value.steam_id)
  const hltbId = Number(value.hltb_id)
  const hltbName = value.hltb_name
  if (
    !Number.isFinite(steamAppId) ||
    steamAppId <= 0 ||
    !Number.isFinite(hltbId) ||
    hltbId <= 0 ||
    typeof hltbName !== 'string'
  ) {
    return null
  }
  return { steamAppId, hltbId, hltbName }
}

export async function fetchSteamImport(
  steamId: string,
): Promise<HltbFetchError | HltbSteamImportGame[]> {
  let data: HltbSteamImportResponse | HltbFetchError | HltbRateLimitError
  try {
    const response = await fetch(`${HLTB_BASE_URL}/api/steam/getSteamImportData`, {
      body: JSON.stringify({ steamUserId: steamId, steamOmitData: 0 }),
      cache: 'no-store',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    data = await readJson<HltbSteamImportResponse>(response)
  } catch (error) {
    return new HltbFetchError({ name: 'HLTB Steam import', reason: 'import threw', cause: error })
  }

  if (data instanceof HltbRateLimitError) {
    return new HltbFetchError({ name: 'HLTB Steam import', reason: data.message })
  }
  if (data instanceof Error) return data
  if (data.error !== undefined) {
    return new HltbFetchError({ name: 'HLTB Steam import', reason: String(data.error) })
  }
  if (!Array.isArray(data.games)) return []
  return data.games.flatMap((row) => {
    const game = toImportGame(row)
    return game ? [game] : []
  })
}

async function fetchBuildId(): Promise<string | HltbFetchError> {
  try {
    const response = await fetch(HLTB_BASE_URL, { cache: 'no-store', headers: baseHeaders })
    if (!response.ok) {
      return new HltbFetchError({ name: 'HLTB', reason: `HTTP ${response.status}` })
    }
    const html = await response.text()
    const match = html.match(/"buildId":"([^"]+)"/)
    if (!match) return new HltbFetchError({ name: 'HLTB', reason: 'missing build id' })
    return match[1]
  } catch (error) {
    return new HltbFetchError({ name: 'HLTB', reason: 'build id fetch threw', cause: error })
  }
}

export async function fetchById(
  hltbId: number,
): Promise<HltbFetchError | HltbRateLimitError | HltbEntry | null> {
  const buildId = await fetchBuildId()
  if (buildId instanceof Error) return buildId

  let data: NextGameResponse | HltbFetchError | HltbRateLimitError
  try {
    const response = await fetch(`${HLTB_BASE_URL}/_next/data/${buildId}/game/${hltbId}.json`, {
      cache: 'no-store',
      headers: baseHeaders,
    })
    data = await readJson<NextGameResponse>(response)
  } catch (error) {
    return new HltbFetchError({ name: hltbId, reason: 'detail fetch threw', cause: error })
  }

  if (data instanceof Error) return data
  const games = data.pageProps?.game?.data?.game
  if (!Array.isArray(games)) {
    return new HltbFetchError({ name: hltbId, reason: 'malformed detail response' })
  }
  if (games.length === 0) return null
  const raw = games[0]
  if (
    raw === undefined ||
    typeof raw.game_name !== 'string' ||
    !Number.isFinite(Number(raw.game_id))
  ) {
    return new HltbFetchError({ name: hltbId, reason: 'malformed game detail' })
  }
  return toEntry(raw)
}
