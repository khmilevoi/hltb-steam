import { HltbApiError, LibraryFetchError } from '@/lib/errors'
import type { HltbEntry, SteamGame } from '@/types/game'

export async function fetchLibrary({ force }: { force: boolean }) {
  const url = `/api/library${force ? '?force=1' : ''}`
  const res = await fetch(url).catch(
    (error) => new LibraryFetchError({ status: 0, code: 'network', cause: error }),
  )
  if (res instanceof Error) throw res

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new LibraryFetchError({ status: res.status, code: body?.error ?? 'unknown' })
  }

  return (await res.json()) as { games: SteamGame[]; cachedAt: string | null }
}

export async function fetchHltb({
  games,
  force,
}: {
  games: Array<{ appid: number; name: string }>
  force: boolean
}) {
  const res = await fetch('/api/hltb', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ games, force }),
  }).catch((error) => new HltbApiError({ status: 0, code: 'network', cause: error }))
  if (res instanceof Error) throw res

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new HltbApiError({ status: res.status, code: body?.error ?? 'unknown' })
  }

  return (await res.json()) as {
    entries: Record<number, HltbEntry | null>
    cachedAt: Record<number, string | null>
  }
}
