import { HltbApiError, LibraryFetchError } from '@/lib/errors'
import type { HltbResponse, HltbSingleResponse, HltbStateResponse, SteamGame } from '@/types/game'

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

async function readHltbJson<T>(url: string): Promise<T> {
  const res = await fetch(url).catch(
    (error) => new HltbApiError({ status: 0, code: 'network', cause: error }),
  )
  if (res instanceof Error) throw res

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new HltbApiError({ status: res.status, code: body?.error ?? 'unknown' })
  }

  return (await res.json()) as T
}

export function fetchHltbState() {
  return readHltbJson<HltbStateResponse>('/api/hltb/state')
}

export function fetchHltbCached() {
  return readHltbJson<HltbResponse>('/api/hltb/cached')
}

export function fetchHltb({ force }: { force: boolean }) {
  return readHltbJson<HltbResponse>(`/api/hltb${force ? '?force=1' : ''}`)
}

export async function fetchHltbGame({ appid }: { appid: number }) {
  const res = await fetch(`/api/hltb/${appid}`).catch(
    (error) => new HltbApiError({ status: 0, code: 'network', cause: error }),
  )
  if (res instanceof Error) throw res

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new HltbApiError({ status: res.status, code: body?.error ?? 'unknown' })
  }

  return (await res.json()) as HltbSingleResponse
}

export async function putHltbOverrideName({
  appid,
  searchName,
}: {
  appid: number
  searchName: string | null
}) {
  const res = await fetch(`/api/hltb/overrides/${appid}`, {
    body: JSON.stringify({ searchName }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  }).catch((error) => new HltbApiError({ status: 0, code: 'network', cause: error }))
  if (res instanceof Error) throw res

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new HltbApiError({ status: res.status, code: body?.error ?? 'unknown' })
  }
}
