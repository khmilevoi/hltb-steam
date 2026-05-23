import { describe, expect, it, vi } from 'vitest'

import { createSteamProvider } from '@/auth'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

describe('createSteamProvider', () => {
  it('keeps next-auth-steam OpenID request handlers instead of OAuth endpoint URLs', () => {
    const provider = createSteamProvider(new Request('http://localhost:3000/api/auth/callback/steam'))

    expect(provider.token).toMatchObject({ request: expect.any(Function) })
    expect(provider.userinfo).toMatchObject({ request: expect.any(Function) })
    expect(provider.token).not.toHaveProperty('url')
    expect(provider.userinfo).not.toHaveProperty('url')
  })
})
