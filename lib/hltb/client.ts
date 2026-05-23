import { HowLongToBeatService } from 'howlongtobeat'
import { HltbFetchError, HltbRateLimitError } from '@/lib/errors'
import { pickBestMatch, type HltbCandidate } from '@/lib/hltb/matcher'
import type { HltbEntry } from '@/types/game'

const service = new HowLongToBeatService()

type RawHltbResult = {
  id: string | number
  name: string
  gameplayMain?: number
  gameplayMainExtra?: number
  gameplayCompletionist?: number
}

function toCandidate(result: RawHltbResult): HltbCandidate {
  const num = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
  return {
    id: Number(result.id),
    name: result.name,
    main: num(result.gameplayMain),
    mainExtra: num(result.gameplayMainExtra),
    completionist: num(result.gameplayCompletionist),
  }
}

export async function searchByName(
  name: string,
): Promise<HltbRateLimitError | HltbFetchError | HltbEntry | null> {
  const results = await service.search(name).catch((error: unknown) => {
    const message = String((error as { message?: unknown })?.message ?? '')
    if (/429/.test(message)) {
      return new HltbRateLimitError({ retryAfterMs: 10_000, cause: error })
    }
    return new HltbFetchError({ name, reason: 'search threw', cause: error })
  })
  if (results instanceof Error) return results
  if (!Array.isArray(results) || results.length === 0) return null
  const candidates = (results as RawHltbResult[]).map(toCandidate)
  return pickBestMatch(candidates, name)
}
