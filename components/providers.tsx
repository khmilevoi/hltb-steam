'use client'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { SessionProvider } from 'next-auth/react'
import { useState } from 'react'
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

  const persister =
    typeof window === 'undefined'
      ? undefined
      : createSyncStoragePersister({ storage: window.localStorage })

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
        <>
          {children}
          <Toaster richColors position="top-right" />
        </>
      )}
    </SessionProvider>
  )
}
