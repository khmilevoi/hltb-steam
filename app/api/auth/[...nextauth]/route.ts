import NextAuth from 'next-auth'
import type { NextRequest } from 'next/server'
import { getAuthOptions } from '@/auth'

type AuthRouteContext = {
  params: Promise<{
    nextauth: string[]
  }>
}

const handler = (req: NextRequest, ctx: AuthRouteContext) =>
  NextAuth(req, ctx, getAuthOptions(req))

export { handler as GET, handler as POST }
