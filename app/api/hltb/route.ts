import { auth } from '@/auth'
import { json } from '@/lib/http'
import { resolveHltbForLibrary } from '@/lib/hltb/resolve'
import { loadUserLibrary } from '@/lib/library/server'

function mapLibraryError(error: Error) {
  if (error.name === 'SteamPrivateProfileError') return json(403, { error: 'private_profile' })
  if (error.name === 'SteamUnavailableError') return json(502, { error: 'steam_unavailable' })
  return json(500, { error: 'internal' })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const steamId = session.user.steamId
  const force = new URL(req.url).searchParams.get('force') === '1'
  const library = await loadUserLibrary({ steamId, force: false })
  if (library instanceof Error) return mapLibraryError(library)

  const result = await resolveHltbForLibrary({
    steamId,
    games: library.games,
    force,
  })

  return json(200, result)
}
