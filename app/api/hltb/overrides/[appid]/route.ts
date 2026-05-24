import { z } from 'zod'
import { auth } from '@/auth'
import * as kv from '@/lib/cache/kv'
import { json } from '@/lib/http'
import { loadUserLibrary } from '@/lib/library/server'

const bodySchema = z.object({
  searchName: z.string().nullable(),
})

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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ appid: string }> },
) {
  const { appid: appidParam } = await params
  const appid = parseAppid(appidParam)
  if (appid === null) return json(400, { error: 'invalid_appid' })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(400, { error: 'invalid_body' })

  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const steamId = session.user.steamId
  const library = await loadUserLibrary({ steamId, force: false })
  if (library instanceof Error) return mapLibraryError(library)

  const game = library.games.find((candidate) => candidate.appid === appid)
  if (!game) return json(404, { error: 'not_found' })

  const mapping = await kv.getHltbMapping(appid)
  if (mapping instanceof Error) return json(500, { error: 'internal' })
  if (mapping !== null) return json(409, { error: 'mapping_exists' })

  const searchName = parsed.data.searchName?.trim() ?? ''
  const result =
    searchName === '' || searchName === game.name
      ? await kv.deleteHltbOverrideName(steamId, appid)
      : await kv.setHltbOverrideName(steamId, appid, searchName)

  if (result instanceof Error) return json(500, { error: 'internal' })
  return new Response(null, { status: 204 })
}
