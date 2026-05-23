import Link from 'next/link'
import { auth } from '@/auth'
import { AuthButton } from '@/components/auth-button'
import { Button } from '@/components/ui/button'

export default async function HomePage() {
  const session = await auth()
  const signedIn = Boolean(session?.user?.steamId)

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">HLTB x Steam</h1>
      <p className="text-muted-foreground text-center">
        See your Steam library next to HowLongToBeat times. Filter and sort to find what fits your
        weekend.
      </p>
      <AuthButton />
      {signedIn ? (
        <Button asChild>
          <Link href="/library">Open my library</Link>
        </Button>
      ) : null}
    </main>
  )
}
