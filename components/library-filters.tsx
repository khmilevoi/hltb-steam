'use client'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'

export type LibraryFiltersValue = {
  query: string
  hltbRange: [number, number]
}

export function LibraryFilters({
  value,
  onChange,
  maxHours,
}: {
  value: LibraryFiltersValue
  onChange: (next: LibraryFiltersValue) => void
  maxHours: number
}) {
  const upperBound = Math.max(maxHours, 1)
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      <label className="flex flex-1 flex-col gap-2 text-sm font-medium" htmlFor="search">
        Search
        <Input
          id="search"
          placeholder="Filter by name..."
          value={value.query}
          onChange={(event) => onChange({ ...value, query: event.target.value })}
        />
      </label>
      <label className="flex flex-1 flex-col gap-3 text-sm font-medium" htmlFor="range">
        HLTB Main: {value.hltbRange[0]}h - {value.hltbRange[1]}h
        <Slider
          id="range"
          min={0}
          max={upperBound}
          step={1}
          value={value.hltbRange}
          onValueChange={(next) =>
            onChange({ ...value, hltbRange: [next[0] ?? 0, next[1] ?? upperBound] })
          }
        />
      </label>
    </div>
  )
}
