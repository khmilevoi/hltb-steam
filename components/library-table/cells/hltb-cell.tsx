'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Props = {
  value: number | null
  isLoading: boolean
  rowHasHltb: boolean
}

function formatHours(value: number): string {
  const minutes = Math.max(0, Math.round(value * 60))
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

export function HltbCell({ value, isLoading, rowHasHltb }: Props) {
  if (isLoading && !rowHasHltb) return <Skeleton className="h-4 w-10" />
  if (value === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground cursor-help">--</span>
        </TooltipTrigger>
        <TooltipContent>HLTB data unavailable</TooltipContent>
      </Tooltip>
    )
  }
  return <>{formatHours(value)}</>
}
