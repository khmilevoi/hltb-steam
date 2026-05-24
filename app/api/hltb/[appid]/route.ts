import * as errore from 'errore'
import { auth } from '@/auth'
import { json } from '@/lib/http'
import { resolveHltbForGame } from '@/lib/hltb/resolve'
import { loadUserLibrary } from '@/lib/library/server'

function parseAppid(value: string): number | null {
  const appid = Number(value)
  if (!Number.isInteger(appid) || appid <= 0) return null
  return appid
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ appid: string }> },
) {
  const { appid: appidParam } = await params
  const appid = parseAppid(appidParam)
  if (appid === null) return json(400, { error: 'invalid_appid' })

  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const steamId = session.user.steamId
  const library = await loadUserLibrary({ steamId, force: false })
  if (library instanceof Error) return errore.matchError(library, {
    SteamPrivateProfileError: () => json(403, { error: 'private_profile' }),
    SteamUnavailableError: () => json(502, { error: 'steam_unavailable' }),
    Error: () => json(500, { error: 'internal' }),
  })

  const game = library.games.find((candidate) => candidate.appid === appid)
  if (!game) return json(404, { error: 'not_found' })

  const force = new URL(req.url).searchParams.get('force') === '1'
  const result = await resolveHltbForGame({ steamId, game, force })
  return json(200, result)
}
