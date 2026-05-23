import pLimit from 'p-limit'
import { z } from 'zod'
import { auth } from '@/auth'
import { json } from '@/lib/http'
import * as kv from '@/lib/cache/kv'
import * as hltb from '@/lib/hltb/client'
import type { HltbEntry } from '@/types/game'

const bodySchema = z.object({
  games: z.array(z.object({ appid: z.number(), name: z.string() })).max(5000),
  force: z.boolean().optional(),
})

const limit = pLimit(5)

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(400, { error: 'invalid_body' })

  const { force, games } = parsed.data
  const entries: Record<number, HltbEntry | null> = {}
  const cachedAtPerEntry: Record<number, string | null> = {}

  await Promise.all(
    games.map((game) =>
      limit(async () => {
        if (!force) {
          const cached = await kv.getHltb(game.name)
          if (cached instanceof Error) {
            console.warn('KV read failed for', game.name, cached.message)
          } else if (cached !== null) {
            entries[game.appid] = cached.value
            cachedAtPerEntry[game.appid] = cached.cachedAt
            return
          }
        }

        const result = await hltb.searchByName(game.name)
        if (result instanceof Error) {
          console.warn('HLTB lookup failed for', game.name, result.message)
          entries[game.appid] = null
          cachedAtPerEntry[game.appid] = null
          return
        }

        entries[game.appid] = result
        cachedAtPerEntry[game.appid] = null

        const writeResult = await kv.setHltb(game.name, result)
        if (writeResult instanceof Error) {
          console.warn('KV write failed for', game.name, writeResult.message)
        }
      }),
    ),
  )

  return json(200, { entries, cachedAt: cachedAtPerEntry })
}
