import { getDashboardData, getAuditLogsForDate, getWeeklyStats, getExpertStats } from '@/lib/actions/demands'
import { listUsers } from '@/lib/actions/users'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AdminView } from './admin-view'
import { ManagerView } from './manager-view'
import { ExpertView } from './expert-view'

function getTodayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const params = await searchParams
  const dateStr = params.date || getTodayStr()

  const { demands, metrics, userRole } = await getDashboardData(dateStr)
  const user = session.user as { name: string; organizationName?: string; role?: string }
  const organizationName = user.organizationName ?? 'Legacy'
  const userName = user.name ?? 'Usuário'

  if (userRole === 'ADMIN') {
    const [users, auditLogs, weeklyStats, expertStats] = await Promise.all([
      listUsers(),
      getAuditLogsForDate(dateStr),
      getWeeklyStats(dateStr),
      getExpertStats(dateStr),
    ])
    return (
      <AdminView
        dateStr={dateStr}
        metrics={metrics}
        demands={demands as any}
        organizationName={organizationName}
        userName={userName}
        users={users as any}
        auditLogs={auditLogs as any}
        weeklyStats={weeklyStats}
        expertStats={expertStats}
      />
    )
  }

  if (userRole === 'MANAGER') {
    const users = await listUsers()
    return (
      <ManagerView
        dateStr={dateStr}
        metrics={metrics}
        demands={demands as any}
        organizationName={organizationName}
        userName={userName}
        users={users as any}
      />
    )
  }

  return (
    <ExpertView
      dateStr={dateStr}
      metrics={metrics}
      demands={demands as any}
      organizationName={organizationName}
      userName={userName}
    />
  )
}
