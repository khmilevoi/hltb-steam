import NextAuth from 'next-auth'
import Steam, { PROVIDER_ID } from 'next-auth-steam'
import type { NextRequest } from 'next/server'

process.env.NEXTAUTH_URL ??= process.env.AUTH_URL ?? 'http://localhost:3000'

function steamProvider(req: NextRequest | undefined) {
  const provider = Steam(req as NextRequest, {
    clientSecret: process.env.STEAM_API_KEY ?? 'missing_steam_api_key',
  })
  return {
    ...provider,
    token: {
      url: 'https://steamcommunity.com/openid/login',
      ...provider.token,
    },
    userinfo: {
      url: 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002',
      ...provider.userinfo,
    },
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth((req) => ({
  providers: [steamProvider(req as NextRequest | undefined)],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === PROVIDER_ID && profile) {
        token.steamId = (profile as { steamid?: string }).steamid
      }
      return token
    },
    async session({ session, token }) {
      if (typeof token.steamId === 'string') {
        session.user.steamId = token.steamId
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
}))
