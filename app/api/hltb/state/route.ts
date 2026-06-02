import { auth } from '@/auth'
import { ensureHltbUserState } from '@/lib/cache/kv'
import { json } from '@/lib/http'

export async function GET() {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const state = await ensureHltbUserState(session.user.steamId)
  if (state instanceof Error) return json(500, { error: 'internal' })
  return json(200, state)
}
