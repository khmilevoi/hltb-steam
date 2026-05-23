'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { SessionProvider } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 24 * 60 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  const [persister, setPersister] =
    useState<ReturnType<typeof createSyncStoragePersister> | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- persistence must initialize after hydration because it needs window.localStorage.
    setPersister(createSyncStoragePersister({ storage: window.localStorage }))
  }, [])

  return (
    <SessionProvider>
      {persister ? (
        <PersistQueryClientProvider
          client={client}
          persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
        >
          {children}
          <Toaster richColors position="top-right" />
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={client}>
          {children}
          <Toaster richColors position="top-right" />
        </QueryClientProvider>
      )}
    </SessionProvider>
  )
}
