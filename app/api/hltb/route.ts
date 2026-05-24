import * as errore from 'errore'
import { auth } from '@/auth'
import { json } from '@/lib/http'
import { resolveHltbForLibrary } from '@/lib/hltb/resolve'
import { loadUserLibrary } from '@/lib/library/server'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const steamId = session.user.steamId
  const force = new URL(req.url).searchParams.get('force') === '1'
  const library = await loadUserLibrary({ steamId, force: false })
  if (library instanceof Error) return errore.matchError(library, {
    SteamPrivateProfileError: () => json(403, { error: 'private_profile' }),
    SteamUnavailableError: () => json(502, { error: 'steam_unavailable' }),
    Error: () => json(500, { error: 'internal' }),
  })

  const result = await resolveHltbForLibrary({
    steamId,
    games: library.games,
    force,
  })

  return json(200, result)
}
