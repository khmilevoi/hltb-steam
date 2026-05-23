'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Props = {
  value: number | null
  isLoading: boolean
  rowHasHltb: boolean
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
  return <>{value}h</>
}
