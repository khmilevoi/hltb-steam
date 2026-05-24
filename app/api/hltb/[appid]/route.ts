import { auth } from '@/auth'
import { json } from '@/lib/http'
import { resolveHltbForGame } from '@/lib/hltb/resolve'
import { loadUserLibrary } from '@/lib/library/server'

function parseAppid(value: string): number | null {
  const appid = Number(value)
  if (!Number.isInteger(appid) || appid <= 0) return null
  return appid
}

function mapLibraryError(error: Error) {
  if (error.name === 'SteamPrivateProfileError') return json(403, { error: 'private_profile' })
  if (error.name === 'SteamUnavailableError') return json(502, { error: 'steam_unavailable' })
  return json(500, { error: 'internal' })
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
  if (library instanceof Error) return mapLibraryError(library)

  const game = library.games.find((candidate) => candidate.appid === appid)
  if (!game) return json(404, { error: 'not_found' })

  const force = new URL(req.url).searchParams.get('force') === '1'
  const result = await resolveHltbForGame({ steamId, game, force })
  return json(200, result)
}
