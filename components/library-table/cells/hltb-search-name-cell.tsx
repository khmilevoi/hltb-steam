'use client'

import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getHltbSearchName } from '@/lib/hltb/meta'
import type { HltbMeta } from '@/types/game'

export function HltbSearchNameCell({
  matchedName,
  meta,
  onReset,
}: {
  meta: HltbMeta | null
  matchedName: string | null
  onReset?: () => void
}) {
  if (!meta) return <span className="text-muted-foreground">--</span>

  if (meta.source === 'steam-import') {
    return <span className="truncate">{matchedName ?? meta.steamName}</span>
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{getHltbSearchName(meta)}</span>
      {meta.overrideName !== null && onReset ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label="Reset HLTB search name"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </span>
  )
}
