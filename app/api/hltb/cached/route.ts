import { auth } from '@/auth'
import * as kv from '@/lib/cache/kv'
import { resolveCachedHltbForLibrary } from '@/lib/hltb/cached'
import { libraryCacheMissingSync } from '@/lib/hltb/sync-meta'
import { json } from '@/lib/http'

const emptyCachedResponse = {
  entries: {},
  cachedAt: {},
  meta: {},
  sync: libraryCacheMissingSync(),
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const steamId = session.user.steamId
  const library = await kv.getLibraryRaw(steamId)
  if (library instanceof Error) return json(500, { error: 'internal' })
  if (library === null) return json(200, emptyCachedResponse)

  return json(200, await resolveCachedHltbForLibrary({ steamId, games: library.value }))
}
