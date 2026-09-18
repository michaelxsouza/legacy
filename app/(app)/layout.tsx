import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { signOut } from '@/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div style={{ minHeight: '100dvh', background: '#0A0A0A' }}>
      <main>{children}</main>
    </div>
  )
}
