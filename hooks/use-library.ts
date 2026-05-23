'use client'

import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchLibrary } from '@/lib/client-fetch'

export const LIBRARY_QUERY_KEY = ['library'] as const

export function useLibrary() {
  return useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary({ force: false }),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export async function refreshLibrary(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary({ force: true }),
    staleTime: 0,
  })
}
