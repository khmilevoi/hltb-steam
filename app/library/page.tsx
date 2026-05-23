import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { LibraryScreen } from './library-screen'

export default async function LibraryPage() {
  const session = await auth()
  if (!session?.user?.steamId) redirect('/')
  return <LibraryScreen />
}
