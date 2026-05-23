'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AuthButton } from '@/components/auth-button'
import { LibraryFilters, type LibraryFiltersValue } from '@/components/library-filters'
import { LibraryTable } from '@/components/library-table'
import { RefreshControls } from '@/components/refresh-controls'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { refreshHltb, useHltb } from '@/hooks/use-hltb'
import { refreshLibrary, useLibrary } from '@/hooks/use-library'
import { LibraryFetchError } from '@/lib/errors'
import { filterByHltbRange, searchByName } from '@/lib/library/filters'
import { mergeGames } from '@/lib/library/merge'

const LIBRARY_FILTERS_STORAGE_KEY = 'hltb-steam:library-filters'
const DEFAULT_LIBRARY_FILTERS: LibraryFiltersValue = {
  query: '',
  hltbRange: [0, 9999],
}

function parseStoredFilters(value: string | null): LibraryFiltersValue | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<LibraryFiltersValue>
    const query = typeof parsed.query === 'string' ? parsed.query : DEFAULT_LIBRARY_FILTERS.query
    if (!Array.isArray(parsed.hltbRange)) return null
    const min = parsed.hltbRange[0]
    const max = parsed.hltbRange[1]
    if (
      typeof min !== 'number' ||
      typeof max !== 'number' ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min > max
    ) {
      return null
    }
    return { query, hltbRange: [min, max] }
  } catch {
    return null
  }
}

export function LibraryScreen() {
  const queryClient = useQueryClient()
  const library = useLibrary()
  const hltb = useHltb({ games: library.data?.games })

  const rows = useMemo(() => {
    if (!library.data) return []
    return mergeGames(library.data.games, hltb.data?.entries ?? {})
  }, [library.data, hltb.data])

  const maxHours = useMemo(() => {
    let max = 0
    for (const row of rows) {
      const value = row.hltb?.mainHours
      if (typeof value === 'number' && value > max) max = value
    }
    return max
  }, [rows])

  const [filters, setFilters] = useState<LibraryFiltersValue>(DEFAULT_LIBRARY_FILTERS)
  const [filtersLoaded, setFiltersLoaded] = useState(false)

  const visibleRows = useMemo(() => {
    const searched = searchByName(rows, filters.query)
    if (filters.hltbRange[0] === 0 && filters.hltbRange[1] >= maxHours) return searched
    return filterByHltbRange(searched, filters.hltbRange[0], filters.hltbRange[1])
  }, [rows, filters, maxHours])

  const isPrivate =
    library.error instanceof LibraryFetchError && library.error.code === 'private_profile'

  useEffect(() => {
    if (library.isError && library.error && !isPrivate) {
      toast.error(`Failed to load library: ${(library.error as Error).message}`)
    }
  }, [library.isError, library.error, isPrivate])

  useEffect(() => {
    try {
      const storedFilters = parseStoredFilters(
        window.localStorage.getItem(LIBRARY_FILTERS_STORAGE_KEY),
      )
      if (storedFilters) setFilters(storedFilters)
    } catch {
      // localStorage can be unavailable in restricted browser contexts.
    }
    setFiltersLoaded(true)
  }, [])

  useEffect(() => {
    if (!filtersLoaded) return
    try {
      window.localStorage.setItem(LIBRARY_FILTERS_STORAGE_KEY, JSON.stringify(filters))
    } catch {
      // Filtering should keep working even when persistence is unavailable.
    }
  }, [filters, filtersLoaded])

  useEffect(() => {
    if (hltb.isError && hltb.error) {
      toast.error(`HLTB fetch failed: ${(hltb.error as Error).message}`)
    }
  }, [hltb.isError, hltb.error])

  if (isPrivate) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Your Steam profile is private</CardTitle>
            <CardDescription>
              Open Steam profile privacy settings and set My profile and Game details to Public,
              then come back and refresh.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuthButton />
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">My Library</h1>
        <AuthButton />
      </header>
      <RefreshControls
        libraryCachedAt={library.data?.cachedAt ?? null}
        hltbCachedAtMap={hltb.data?.cachedAt ?? {}}
        onRefreshLibrary={async () => {
          try {
            await refreshLibrary(queryClient)
          } catch (error) {
            toast.error(`Refresh library failed: ${(error as Error).message}`)
          }
        }}
        onRefreshHltb={async () => {
          if (!library.data?.games) return
          try {
            await refreshHltb(queryClient, library.data.games)
          } catch (error) {
            toast.error(`Refresh HLTB failed: ${(error as Error).message}`)
          }
        }}
      />
      <LibraryFilters value={filters} onChange={setFilters} maxHours={maxHours} />
      {library.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <LibraryTable rows={visibleRows} hltbLoading={hltb.isFetching} />
      )}
    </main>
  )
}
