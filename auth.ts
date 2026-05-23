import NextAuth from 'next-auth'
import Steam, { PROVIDER_ID } from 'next-auth-steam'
import type { NextRequest } from 'next/server'

export const { handlers, auth, signIn, signOut } = NextAuth((req) => ({
  providers: [Steam(req as NextRequest, { clientSecret: process.env.STEAM_API_KEY! })],
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
