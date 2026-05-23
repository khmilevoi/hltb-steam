import { useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { createSyncStoragePersisterMock } = vi.hoisted(() => ({
  createSyncStoragePersisterMock: vi.fn(),
}))

vi.mock('@tanstack/query-sync-storage-persister', () => ({
  createSyncStoragePersister: createSyncStoragePersisterMock,
}))

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

import { Providers } from '@/components/providers'

function QueryClientConsumer() {
  useQueryClient()
  return <div>query client available</div>
}

describe('Providers', () => {
  it('does not create the localStorage persister during server render', () => {
    createSyncStoragePersisterMock.mockReturnValue(undefined)

    renderToString(
      <Providers>
        <div>server render</div>
      </Providers>,
    )

    expect(createSyncStoragePersisterMock).not.toHaveBeenCalled()
  })

  it('provides a QueryClient when localStorage persistence is unavailable', () => {
    createSyncStoragePersisterMock.mockReturnValue(undefined)

    render(
      <Providers>
        <QueryClientConsumer />
      </Providers>,
    )

    expect(screen.getByText('query client available')).toBeTruthy()
  })
})
