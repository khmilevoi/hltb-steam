'use client'

import { signIn, signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export function AuthButton() {
  const { data: session, status } = useSession()
  if (status === 'loading') return <Button disabled>Loading...</Button>
  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {session.user.name ?? session.user.steamId}
        </span>
        <Button variant="outline" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    )
  }
  return <Button onClick={() => signIn('steam')}>Sign in through Steam</Button>
}
