'use client'

import { formatDistanceToNow } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function RefreshControls({
  libraryCachedAt,
  hltbCachedAtMap,
  onRefreshLibrary,
  onRefreshHltb,
}: {
  libraryCachedAt: string | null
  hltbCachedAtMap: Record<number, string | null>
  onRefreshLibrary: () => Promise<void> | void
  onRefreshHltb: () => Promise<void> | void
}) {
  const [cooldown, setCooldown] = useState<'library' | 'hltb' | null>(null)

  async function withCooldown(key: 'library' | 'hltb', fn: () => Promise<void> | void) {
    setCooldown(key)
    await fn()
    setTimeout(() => setCooldown(null), 10_000)
  }

  const hltbStamps = Object.values(hltbCachedAtMap).filter((stamp): stamp is string => stamp !== null)
  const oldestHltb = hltbStamps.length > 0 ? [...hltbStamps].sort()[0] : null

  const libraryAgo =
    libraryCachedAt === null ? 'just now' : `${formatDistanceToNow(new Date(libraryCachedAt))} ago`
  const hltbAgo =
    oldestHltb === null ? 'just now' : `${formatDistanceToNow(new Date(oldestHltb))} ago`

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="text-muted-foreground text-sm">
        Library updated: {libraryAgo} | HLTB cache: {hltbAgo}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={cooldown !== null}
          onClick={() => withCooldown('library', onRefreshLibrary)}
        >
          <RefreshCw data-icon="inline-start" />
          Refresh library
        </Button>
        <Button
          variant="outline"
          disabled={cooldown !== null}
          onClick={() => withCooldown('hltb', onRefreshHltb)}
        >
          <RefreshCw data-icon="inline-start" />
          Refresh HLTB
        </Button>
      </div>
    </div>
  )
}
