import type { HltbMeta } from '@/types/game'

export function getHltbSearchName(meta: HltbMeta): string {
  return meta.overrideName ?? meta.steamName
}
