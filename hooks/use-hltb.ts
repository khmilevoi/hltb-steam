'use client'

import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchHltb } from '@/lib/client-fetch'
import type { SteamGame } from '@/types/game'

export function hltbQueryKey(appids: number[]) {
  return ['hltb', appids] as const
}

export function useHltb({ games }: { games: SteamGame[] | undefined }) {
  const enabled = games !== undefined && games.length > 0
  const appids = useMemo(() => games?.map((game) => game.appid) ?? [], [games])
  return useQuery({
    enabled,
    queryKey: hltbQueryKey(appids),
    queryFn: () =>
      fetchHltb({
        games: (games ?? []).map((game) => ({ appid: game.appid, name: game.name })),
        force: false,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export async function refreshHltb(queryClient: QueryClient, games: SteamGame[]) {
  await queryClient.fetchQuery({
    queryKey: hltbQueryKey(games.map((game) => game.appid)),
    queryFn: () =>
      fetchHltb({
        games: games.map((game) => ({ appid: game.appid, name: game.name })),
        force: true,
      }),
    staleTime: 0,
  })
}
