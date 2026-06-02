'use client'

import { Loader2, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getHltbSearchName } from '@/lib/hltb/meta'
import type { HltbMeta } from '@/types/game'

export function HltbSearchNameCell({
  matchedName,
  meta,
  onReset,
  onEdit,
  isSaving,
}: {
  meta: HltbMeta | null
  matchedName: string | null
  onReset?: () => void
  onEdit?: () => void
  isSaving?: boolean
}) {
  if (!meta) {
    if (!matchedName) return <span className="text-muted-foreground">--</span>

    return (
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate">{matchedName}</span>
        {isSaving ? (
          <Loader2
            className="text-muted-foreground size-3.5 shrink-0 animate-spin"
            aria-hidden="true"
          />
        ) : onEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            aria-label="Edit HLTB search name"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </span>
    )
  }

  if (meta.source === 'steam-import') {
    return <span className="truncate">{matchedName ?? meta.steamName}</span>
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{getHltbSearchName(meta)}</span>
      {isSaving ? (
        <Loader2
          className="text-muted-foreground size-3.5 shrink-0 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <>
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
          {onEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              aria-label="Edit HLTB search name"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </>
      )}
    </span>
  )
}
