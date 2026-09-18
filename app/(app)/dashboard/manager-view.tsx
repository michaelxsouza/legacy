'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { approveDemands, rejectDemands, completeDemand } from '@/lib/actions/demands'
import { formatBRL, formatDateTime } from '@/lib/utils'
import { Cutoff } from '@prisma/client'

type Demand = {
  id: string
  type: string
  status: string
  playerName: string
  playerId: string | null
  amountInCents: number | null
  cutoff: Cutoff
  operationalDate: Date | string
  createdAt: Date | string
  createdBy: { id: string; name: string }
  approvedBy: { name: string } | null
  completedBy: { name: string } | null
  cancelledBy: { name: string } | null
}

type Metrics = {
  goldenTotal: number
  goldenPending: number
  goldenApproved: number
  goldenCompleted: number
  goldenValueCents: number
  baseTotal: number
}

type User = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
}

type Props = {
  dateStr: string
  metrics: Metrics
  demands: Demand[]
  organizationName: string
  userName: string
  users: User[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:   { label: 'Pendente',  color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  APPROVED:  { label: 'Aprovada',  color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  COMPLETED: { label: 'Concluída', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  CANCELLED: { label: 'Recusada',  color: 'bg-red-500/10 text-red-400 border-red-500/30' },
}
type NotifItem = { id: string; title: string; body: string; time: Date; read: boolean }

function NotificationBell({
  notifs, isOpen, onToggle, onMarkAllRead,
}: {
  notifs: NotifItem[]; isOpen: boolean; onToggle: () => void; onMarkAllRead: () => void
}) {
  const unread = notifs.filter(n => !n.read).length
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="relative w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors text-base"
        aria-label="Notificações"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-black text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute right-0 top-11 w-80 bg-[#1C1C1C] border border-white/[0.10] rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Notificações</p>
              {unread > 0 && (
                <button onClick={onMarkAllRead} className="text-xs text-orange-400 hover:text-orange-300 transition-colors">
                  Marcar todas como lidas
                </button>
              )}
            </div>
            {notifs.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-sm text-gray-500">Nenhuma notificação ainda</p>
                <p className="text-xs text-gray-600 mt-1">Você será avisado quando chegar ficha nova</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.04]">
                {notifs.map(n => (
                  <div key={n.id} className={`px-4 py-3 flex items-start gap-3 transition-colors ${!n.read ? 'bg-orange-500/[0.04]' : ''}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${!n.read ? 'bg-orange-500' : 'bg-transparent'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${!n.read ? 'text-white' : 'text-gray-400'}`}>{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-xs text-gray-700 mt-1">
                        {n.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}



function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function MetricCard({
  label, value, sub, accent, alert,
}: { label: string; value: string | number; sub?: string; accent?: boolean; alert?: boolean }) {
  return (
    <div className={`rounded-xl p-5 border ${
      alert   ? 'bg-yellow-500/5 border-yellow-500/20' :
      accent  ? 'bg-orange-500/5 border-orange-500/20' :
                'bg-white/[0.02] border-white/[0.06]'
    }`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">{label}</p>
      <p className={`text-2xl font-bold ${alert ? 'text-yellow-400' : accent ? 'text-orange-400' : 'text-white'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function CountdownTimer() {
  const [timeStr, setTimeStr] = useState('')
  const [label, setLabel] = useState('')

  useEffect(() => {
    function tick() {
      const brNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
      const h = brNow.getHours()
      const m = brNow.getMinutes()
      const s = brNow.getSeconds()
      let targetH = 12
      let lbl = 'Corte 12:00'
      if (h >= 12) { targetH = 18; lbl = 'Corte 18:00' }
      if (h >= 18) { targetH = 36; lbl = 'Corte 12:00 (amanhã)' }
      const totalSec = (targetH - h) * 3600 - m * 60 - s
      if (totalSec <= 0) { setTimeStr('00:00:00'); return }
      const hh = Math.floor(totalSec / 3600)
      const mm = Math.floor((totalSec % 3600) / 60)
      const ss = totalSec % 60
      setTimeStr(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`)
      setLabel(lbl)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (!timeStr) return null
  return (
    <div className="hidden sm:flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-mono font-bold text-orange-400">{timeStr}</span>
    </div>
  )
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const EXPERT_COLORS = [
  'bg-purple-500/20 border-purple-500/30 text-purple-300',
  'bg-blue-500/20 border-blue-500/30 text-blue-300',
  'bg-cyan-500/20 border-cyan-500/30 text-cyan-300',
  'bg-pink-500/20 border-pink-500/30 text-pink-300',
  'bg-indigo-500/20 border-indigo-500/30 text-indigo-300',
]


// ── LastRefreshed indicator ───────────────────────────────────────────────────
function LastRefreshed({ interval = 30000 }: { interval?: number }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    setSecs(0)
    const id = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const label = secs < 5 ? 'agora' : secs < 60 ? `${secs}s atrás` : `${Math.floor(secs / 60)}m atrás`
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-gray-600">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500/60 animate-pulse inline-block" />
      {label}
    </span>
  )
}

export function ManagerView({ dateStr, metrics, demands, organizationName, userName, users }: Props) {
  const [tab, setTab] = useState<'pending' | 'approved' | 'completed' | 'base'>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filterCutoff, setFilterCutoff] = useState<string>('ALL')
  const [filterExpert, setFilterExpert] = useState<string>('ALL')
  const [search, setSearch] = useState<string>('')
  const [notifs, setNotifs] = useState<NotifItem[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [confirmAction, setConfirmAction] = useState<{ type: 'approve'|'reject'|'complete'; ids: string[]; label: string } | null>(null)
  const router = useRouter()

  // Smart auto-refresh: every 10s when on pending tab with items, 30s otherwise
  useEffect(() => {
    const interval = tab === 'pending' && metrics.goldenPending > 0 ? 10000 : 30000
    const id = setInterval(() => router.refresh(), interval)
    return () => clearInterval(id)
  }, [router, tab, metrics.goldenPending])

  // Request browser notification permission on first load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Track previous pending count to detect new arrivals
  const prevPendingRef = useRef(metrics.goldenPending)
  useEffect(() => {
    const prev = prevPendingRef.current
    const curr = metrics.goldenPending
    if (curr > prev) {
      const diff = curr - prev
      const notifBody = `${diff} nova${diff > 1 ? 's' : ''} ficha${diff > 1 ? 's' : ''} aguardando sua aprovação`
      setNotifs(prev => [{
        id: Date.now().toString(),
        title: 'Nova ficha pendente',
        body: notifBody,
        time: new Date(),
        read: false,
      }, ...prev].slice(0, 30))
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Legacy — Nova ficha pendente', {
            body: notifBody,
            icon: '/favicon.ico',
            tag: 'legacy-pending',
          })
        } catch (_) {}
      }
    }
    prevPendingRef.current = curr
  }, [metrics.goldenPending])

  const experts = users.filter(u => u.role === 'EXPERT' && u.active)
  const goldenDemands = demands.filter(d => d.type === 'GOLDEN_TOKEN')
  const pendingGolden  = goldenDemands.filter(d => d.status === 'PENDING')
  const approvedGolden = goldenDemands.filter(d => d.status === 'APPROVED')
  const completedGolden = goldenDemands.filter(d => d.status === 'COMPLETED')
  const basePlayers = demands.filter(d => d.type === 'BASE_PLAYER')

  // Expert performance stats from demands data
  type ExpertStat = {
    id: string; name: string; colorIdx: number
    pending: number; approved: number; completed: number; cancelled: number; valueCents: number
  }
  const expertStats: ExpertStat[] = experts.map((u, i) => {
    const mine = goldenDemands.filter(d => d.createdBy.id === u.id)
    return {
      id: u.id,
      name: u.name,
      colorIdx: i % EXPERT_COLORS.length,
      pending:   mine.filter(d => d.status === 'PENDING').length,
      approved:  mine.filter(d => d.status === 'APPROVED').length,
      completed: mine.filter(d => d.status === 'COMPLETED').length,
      cancelled: mine.filter(d => d.status === 'CANCELLED').length,
      valueCents: mine
        .filter(d => d.status === 'APPROVED' || d.status === 'COMPLETED')
        .reduce((s, d) => s + (d.amountInCents || 0), 0),
    }
  })
  // Also include experts that appear in demands but not in users list
  const knownIds = new Set(experts.map(u => u.id))
  const extraNames = new Set<string>()
  goldenDemands.forEach(d => {
    if (!knownIds.has(d.createdBy.id)) extraNames.add(d.createdBy.name)
  })
  extraNames.forEach((name, idx) => {
    const mine = goldenDemands.filter(d => d.createdBy.name === name)
    expertStats.push({
      id: name,
      name,
      colorIdx: (experts.length + idx) % EXPERT_COLORS.length,
      pending:   mine.filter(d => d.status === 'PENDING').length,
      approved:  mine.filter(d => d.status === 'APPROVED').length,
      completed: mine.filter(d => d.status === 'COMPLETED').length,
      cancelled: mine.filter(d => d.status === 'CANCELLED').length,
      valueCents: mine.filter(d => d.status === 'APPROVED' || d.status === 'COMPLETED').reduce((s, d) => s + (d.amountInCents || 0), 0),
    })
  })

  // Filters
  function applyFilters(list: Demand[]) {
    return list.filter(d => {
      if (filterCutoff !== 'ALL' && d.cutoff !== filterCutoff) return false
      if (filterExpert !== 'ALL' && d.createdBy.name !== filterExpert) return false
      if (search) {
        const q = search.toLowerCase()
        if (!d.playerName.toLowerCase().includes(q) && !(d.playerId || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }

  // Selection helpers
  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll(ids: string[]) {
    setSelected(prev => {
      const allSel = ids.every(id => prev.has(id))
      const n = new Set(prev)
      allSel ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id))
      return n
    })
  }

  // Actions
  function handleApprove(ids: string[]) {
    const label = ids.length === 1 ? '1 ficha' : `${ids.length} fichas`
    setConfirmAction({ type: 'approve', ids, label })
  }
  function handleReject(ids: string[]) {
    const label = ids.length === 1 ? '1 ficha' : `${ids.length} fichas`
    setConfirmAction({ type: 'reject', ids, label })
  }
  function handleComplete(id: string) {
    setConfirmAction({ type: 'complete', ids: [id], label: '1 ficha' })
  }

  function executeConfirmed() {
    if (!confirmAction) return
    const { type, ids } = confirmAction
    setConfirmAction(null)
    startTransition(async () => {
      if (type === 'approve') {
        const res = await approveDemands(ids)
        if (res && 'error' in res) toast.error(res.error)
        else { toast.success(`${ids.length} ficha${ids.length > 1 ? 's' : ''} aprovada${ids.length > 1 ? 's' : ''}!`); setSelected(new Set()); router.refresh() }
      } else if (type === 'reject') {
        const res = await rejectDemands(ids)
        if (res && 'error' in res) toast.error(res.error)
        else { toast.success(`${ids.length} ficha${ids.length > 1 ? 's' : ''} recusada${ids.length > 1 ? 's' : ''}`); setSelected(new Set()); router.refresh() }
      } else {
        const res = await completeDemand(ids[0])
        if (res && 'error' in res) toast.error(res.error)
        else { toast.success('Ficha concluída!'); router.refresh() }
      }
    })
  }

  // Date nav
  const prevDate = new Date(dateStr + 'T12:00:00Z'); prevDate.setDate(prevDate.getDate() - 1)
  const nextDate = new Date(dateStr + 'T12:00:00Z'); nextDate.setDate(nextDate.getDate() + 1)
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

  const filteredPending   = applyFilters(pendingGolden)
  const filteredApproved  = applyFilters(approvedGolden)
  const filteredCompleted = applyFilters(completedGolden)
  const filteredBase      = applyFilters(basePlayers)

  const tabs = [
    { key: 'pending',   label: 'Pendentes',     count: pendingGolden.length,   alert: true },
    { key: 'approved',  label: 'Para Concluir',  count: approvedGolden.length,  alert: false },
    { key: 'completed', label: 'Concluídas',     count: completedGolden.length, alert: false },
    { key: 'base',      label: 'Base',           count: basePlayers.length,     alert: false },
  ] as const

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.06] bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-orange-500 flex items-center justify-center text-black font-black text-sm shrink-0">L</div>
            <div className="min-w-0 hidden sm:block">
              <p className="font-semibold text-white leading-tight truncate">{organizationName}</p>
              <p className="text-xs text-gray-500">Painel do Gerente</p>
            </div>
            <span className="font-bold text-white sm:hidden text-base">Legacy</span>
          </div>

          <CountdownTimer />

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <NotificationBell
              notifs={notifs}
              isOpen={showNotifs}
              onToggle={() => {
                setShowNotifs(v => !v)
                setNotifs(prev => prev.map(n => ({ ...n, read: true })))
              }}
              onMarkAllRead={() => setNotifs(prev => prev.map(n => ({ ...n, read: true })))}
            />
            <span className="text-sm text-gray-400 hidden lg:block">{userName}</span>
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30 uppercase tracking-wider">
              Gerente
            </span>
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1.5 rounded-lg border border-transparent hover:border-white/10">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-8">
        {/* ── Date navigation ──────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Operações</h1>
            <p className="text-gray-500 text-sm mt-1">Gerencie fichas e acompanhe seus Experts</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <LastRefreshed />
            {dateStr !== fmtDate(new Date()) && (
              <a href="/dashboard" className="text-xs font-medium text-orange-400 hover:text-orange-300 border border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 transition-colors px-3 py-1.5 rounded-lg">
                Hoje
              </a>
            )}
            <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.08] rounded-xl p-1">
              <a
                href={`/dashboard?date=${fmtDate(prevDate)}`}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </a>
              <label className="relative cursor-pointer">
                <span className="text-sm font-medium px-3 py-1.5 text-gray-200 hover:text-white transition-colors whitespace-nowrap select-none block">
                  {new Date(dateStr + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                </span>
                <input
                  type="date"
                  value={dateStr}
                  max={fmtDate(new Date())}
                  onChange={e => e.target.value && router.push(`/dashboard?date=${e.target.value}`)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
              </label>
              <a
                href={dateStr >= fmtDate(new Date()) ? '#' : `/dashboard?date=${fmtDate(nextDate)}`}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                  dateStr >= fmtDate(new Date())
                    ? 'text-gray-700 cursor-not-allowed'
                    : 'text-gray-500 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* ── Metrics ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard label="Aguardando"    value={metrics.goldenPending}                        alert={metrics.goldenPending > 0}   sub="para aprovar" />
          <MetricCard label="Aprovadas"     value={metrics.goldenApproved}                       accent={metrics.goldenApproved > 0} sub="a concluir" />
          <MetricCard label="Concluídas"    value={metrics.goldenCompleted}                      sub="neste dia" />
          <MetricCard label="Valor Ativo"   value={formatBRL(metrics.goldenValueCents)}           accent sub="aprovadas + concluídas" />
          <MetricCard label="Jogadores Base" value={metrics.baseTotal}                           sub="cadastrados" />
        </div>

        {/* ── Expert performance cards ─────────────────────────────── */}
        {expertStats.length > 0 && (
          <section>
            <h2 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">
              Performance dos Experts — hoje
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {expertStats.map(e => (
                <div
                  key={e.id}
                  onClick={() => setFilterExpert(filterExpert === e.name ? 'ALL' : e.name)}
                  className={`shrink-0 w-52 rounded-xl p-4 border transition-all cursor-pointer ${
                    filterExpert === e.name
                      ? 'bg-white/[0.06] border-orange-500/40 ring-1 ring-orange-500/20'
                      : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${EXPERT_COLORS[e.colorIdx]}`}>
                      {initials(e.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{e.name.split(' ')[0]}</p>
                      <p className="text-xs text-gray-600 truncate">{e.name.split(' ').slice(1).join(' ')}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Pendentes</span>
                      <span className={`font-semibold ${e.pending > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                        {e.pending}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Aprovadas</span>
                      <span className={`font-semibold ${e.approved > 0 ? 'text-blue-400' : 'text-gray-600'}`}>
                        {e.approved}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Concluídas</span>
                      <span className={`font-semibold ${e.completed > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                        {e.completed}
                      </span>
                    </div>
                    {e.cancelled > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">Recusadas</span>
                        <span className="text-red-400 font-semibold">{e.cancelled}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-white/[0.06] flex justify-between items-center text-xs">
                      <span className="text-gray-500">Total ativo</span>
                      <span className={`font-bold ${e.valueCents > 0 ? 'text-orange-400' : 'text-gray-600'}`}>
                        {e.valueCents > 0 ? formatBRL(e.valueCents) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* mini progress bar */}
                  {(e.pending + e.approved + e.completed) > 0 && (
                    <div className="mt-3 h-1 rounded-full bg-white/[0.06] overflow-hidden flex">
                      {e.completed > 0 && (
                        <div className="bg-green-500/60 h-full" style={{ width: `${(e.completed / (e.pending + e.approved + e.completed)) * 100}%` }} />
                      )}
                      {e.approved > 0 && (
                        <div className="bg-blue-500/60 h-full" style={{ width: `${(e.approved / (e.pending + e.approved + e.completed)) * 100}%` }} />
                      )}
                      {e.pending > 0 && (
                        <div className="bg-yellow-500/60 h-full" style={{ width: `${(e.pending / (e.pending + e.approved + e.completed)) * 100}%` }} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {filterExpert !== 'ALL' && (
              <p className="text-xs text-gray-500 mt-2">
                Filtrando por <span className="text-orange-400 font-medium">{filterExpert}</span> —{' '}
                <button onClick={() => setFilterExpert('ALL')} className="underline hover:text-white transition-colors">limpar filtro</button>
              </p>
            )}
          </section>
        )}

        {/* ── Tabs ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden md:flex gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key as typeof tab); setSelected(new Set()) }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.key ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold ${
                    tab === t.key
                      ? 'bg-black/20 text-black'
                      : t.alert
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-white/10 text-white'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + filters */}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">⌕</span>
              <input
                type="text"
                placeholder="Buscar jogador ou ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg pl-7 pr-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 w-52"
              />
            </div>
            <select
              value={filterExpert}
              onChange={e => setFilterExpert(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"
            >
              <option value="ALL">Todos os Experts</option>
              {experts.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
            <select
              value={filterCutoff}
              onChange={e => setFilterCutoff(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"
            >
              <option value="ALL">Todos os cortes</option>
              <option value="CUT_12">Corte 12:00</option>
              <option value="CUT_18">Corte 18:00</option>
            </select>
          </div>
        </div>

        {/* ── PENDING TAB ─────────────────────────────────────────── */}
        {tab === 'pending' && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            {/* Bulk actions bar */}
            {selected.size > 0 && (
              <div className="px-5 py-3 bg-orange-500/5 border-b border-orange-500/10 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-orange-400 font-medium">
                  {selected.size} selecionada{selected.size > 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => handleReject([...selected])}
                  disabled={isPending}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  Recusar selecionadas
                </button>
                <button
                  onClick={() => handleApprove([...selected])}
                  disabled={isPending}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                >
                  Aprovar selecionadas
                </button>
                <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  Limpar seleção
                </button>
              </div>
            )}

            {filteredPending.length === 0 ? (
              <div className="p-14 text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 text-xl mx-auto mb-4">✓</div>
                <p className="text-gray-300 font-semibold">Nenhuma ficha pendente</p>
                <p className="text-gray-600 text-sm mt-1">
                  {search || filterExpert !== 'ALL' || filterCutoff !== 'ALL'
                    ? 'Nenhum resultado para os filtros aplicados'
                    : 'Todas as fichas foram processadas'}
                </p>
              </div>
            ) : (
              <>
              {/* Mobile cards */}
              <div className="mobile-cards p-3">
                {filteredPending.map(d => (
                  <div key={d.id} className="demand-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{d.playerName}</p>
                        {d.playerId && <p className="text-xs text-gray-500 font-mono mt-0.5">#{d.playerId}</p>}
                        <p className="text-xs text-gray-600 mt-1">{d.createdBy.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-orange-400 font-bold text-base">{d.amountInCents ? formatBRL(d.amountInCents) : '—'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{d.cutoff === 'CUT_12' ? '12:00' : '18:00'}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleReject([d.id])} disabled={isPending}
                        className="flex-1 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform">
                        ✕ Recusar
                      </button>
                      <button onClick={() => handleApprove([d.id])} disabled={isPending}
                        className="flex-1 py-2 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform">
                        ✓ Aprovar
                      </button>
                    </div>
                  </div>
                ))}
                {filteredPending.length > 1 && (
                  <div className="flex gap-2 mt-1 pt-3 border-t border-white/[0.06]">
                    <button onClick={() => handleReject(filteredPending.map(d => d.id))} disabled={isPending}
                      className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-semibold disabled:opacity-50">
                      ✕ Recusar todas ({filteredPending.length})
                    </button>
                    <button onClick={() => handleApprove(filteredPending.map(d => d.id))} disabled={isPending}
                      className="flex-1 py-2.5 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 text-sm font-semibold disabled:opacity-50">
                      ✓ Aprovar todas ({filteredPending.length})
                    </button>
                  </div>
                )}
              </div>
              {/* Desktop table */}
              <div className="desktop-table overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-5 py-3.5 w-10">
                      <input
                        type="checkbox"
                        className="accent-orange-500 w-4 h-4"
                        checked={filteredPending.length > 0 && filteredPending.every(d => selected.has(d.id))}
                        onChange={() => toggleAll(filteredPending.map(d => d.id))}
                      />
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Jogador</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Expert</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Valor</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Corte</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Enviado às</th>
                    <th className="px-4 py-3.5 text-right text-xs text-gray-500 font-medium uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map(d => (
                    <tr
                      key={d.id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${selected.has(d.id) ? 'bg-orange-500/[0.04]' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <input type="checkbox" className="accent-orange-500 w-4 h-4" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} />
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-white">{d.playerName}</p>
                        {d.playerId && <p className="text-xs text-gray-600 font-mono">#{d.playerId}</p>}
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${
                          EXPERT_COLORS[expertStats.findIndex(e => e.name === d.createdBy.name) % EXPERT_COLORS.length] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                        }`}>
                          {d.createdBy.name}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-orange-400 font-semibold">
                        {d.amountInCents ? formatBRL(d.amountInCents) : '—'}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs bg-white/[0.05] border border-white/[0.08] rounded px-2 py-0.5 font-mono">
                          {d.cutoff === 'CUT_12' ? '12:00' : '18:00'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs hidden md:table-cell">{formatDateTime(d.createdAt)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleReject([d.id])}
                            disabled={isPending}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            Recusar
                          </button>
                          <button
                            onClick={() => handleApprove([d.id])}
                            disabled={isPending}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50 font-medium"
                          >
                            ✓ Aprovar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              </>
            )}
          </div>
        )}

        {/* ── APPROVED (to complete) TAB ───────────────────────────── */}
        {tab === 'approved' && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            {filteredApproved.length === 0 ? (
              <div className="p-14 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xl mx-auto mb-4">○</div>
                <p className="text-gray-300 font-semibold">Nenhuma ficha para concluir</p>
                <p className="text-gray-600 text-sm mt-1">
                  {search || filterExpert !== 'ALL' || filterCutoff !== 'ALL'
                    ? 'Nenhum resultado para os filtros aplicados'
                    : 'Aprove fichas da aba Pendentes para elas aparecerem aqui'}
                </p>
              </div>
            ) : (
              <>
              {/* Mobile cards */}
              <div className="mobile-cards p-3">
                {filteredApproved.map(d => (
                  <div key={d.id} className="demand-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{d.playerName}</p>
                        {d.playerId && <p className="text-xs text-gray-500 font-mono mt-0.5">#{d.playerId}</p>}
                        <p className="text-xs text-gray-600 mt-1">{d.createdBy.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-orange-400 font-bold text-base">{d.amountInCents ? formatBRL(d.amountInCents) : '—'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{d.cutoff === 'CUT_12' ? '12:00' : '18:00'}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-gray-500">Aprov. por: {d.approvedBy?.name || '—'}</span>
                      <button onClick={() => handleComplete(d.id)} disabled={isPending}
                        className="px-4 py-2 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform">
                        ✓ Concluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="desktop-table overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-5 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Jogador</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Expert</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Valor</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Corte</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Aprovado por</th>
                    <th className="px-4 py-3.5 text-right text-xs text-gray-500 font-medium uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApproved.map(d => (
                    <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-white">{d.playerName}</p>
                        {d.playerId && <p className="text-xs text-gray-600 font-mono">#{d.playerId}</p>}
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${
                          EXPERT_COLORS[expertStats.findIndex(e => e.name === d.createdBy.name) % EXPERT_COLORS.length] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                        }`}>
                          {d.createdBy.name}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-orange-400 font-semibold">
                        {d.amountInCents ? formatBRL(d.amountInCents) : '—'}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs bg-white/[0.05] border border-white/[0.08] rounded px-2 py-0.5 font-mono">
                          {d.cutoff === 'CUT_12' ? '12:00' : '18:00'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs hidden md:table-cell">{d.approvedBy?.name || '—'}</td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => handleComplete(d.id)}
                          disabled={isPending}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50 font-medium"
                        >
                          ✓ Concluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              </>
            )}
          </div>
        )}

        {/* ── COMPLETED TAB ────────────────────────────────────────── */}
        {tab === 'completed' && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            {filteredCompleted.length === 0 ? (
              <div className="p-10 text-center text-gray-500 text-sm">
                {search || filterExpert !== 'ALL' || filterCutoff !== 'ALL'
                  ? 'Nenhum resultado para os filtros aplicados'
                  : 'Nenhuma ficha concluída ainda hoje'}
              </div>
            ) : (
              <>
              {/* Mobile cards */}
              <div className="mobile-cards p-3">
                {filteredCompleted.map(d => (
                  <div key={d.id} className="demand-card" style={{ opacity: 0.85 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{d.playerName}</p>
                        {d.playerId && <p className="text-xs text-gray-500 font-mono mt-0.5">#{d.playerId}</p>}
                        <p className="text-xs text-gray-600 mt-1">{d.createdBy.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-orange-400 font-bold text-base">{d.amountInCents ? formatBRL(d.amountInCents) : '—'}</p>
                        <StatusBadge status={d.status} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{d.cutoff === 'CUT_12' ? '12:00' : '18:00'}</span>
                      <span>Conc. por: {d.completedBy?.name || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="desktop-table overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-5 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Jogador</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Expert</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Valor</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Corte</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Concluído por</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompleted.map(d => (
                    <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-white">{d.playerName}</p>
                        {d.playerId && <p className="text-xs text-gray-600 font-mono">#{d.playerId}</p>}
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${
                          EXPERT_COLORS[expertStats.findIndex(e => e.name === d.createdBy.name) % EXPERT_COLORS.length] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                        }`}>
                          {d.createdBy.name}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-orange-400 font-semibold">
                        {d.amountInCents ? formatBRL(d.amountInCents) : '—'}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs bg-white/[0.05] border border-white/[0.08] rounded px-2 py-0.5 font-mono">
                          {d.cutoff === 'CUT_12' ? '12:00' : '18:00'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={d.status} /></td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs hidden md:table-cell">{d.completedBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              </>
            )}
          </div>
        )}

        {/* ── BASE PLAYERS TAB ─────────────────────────────────────── */}
        {tab === 'base' && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            {filteredBase.length > 0 && (
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">{filteredBase.length} jogador{filteredBase.length > 1 ? 'es' : ''} na base</p>
              </div>
            )}
            {filteredBase.length === 0 ? (
              <div className="py-10 text-center text-gray-500 text-sm">
                {search || filterExpert !== 'ALL' || filterCutoff !== 'ALL'
                  ? 'Nenhum resultado para os filtros aplicados'
                  : 'Nenhum jogador na base hoje'}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {filteredBase.map(d => (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.03] rounded-lg border border-white/[0.06] hover:border-white/[0.10] transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{d.playerName}</p>
                      {d.playerId && <p className="text-xs text-gray-600 font-mono">#{d.playerId}</p>}
                    </div>
                    <span className="ml-auto shrink-0 text-xs text-gray-600 font-mono">
                      {d.cutoff === 'CUT_12' ? '12h' : '18h'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Spacer so content not hidden behind bottom nav on mobile ── */}
      <div className="mobile-nav-spacer" />

      {/* ── Mobile bottom navigation bar ─────────────────────────── */}
      <nav className="mobile-bottom-nav">
        {([
          { key: 'pending',   icon: '⏳', label: 'Pendentes', count: pendingGolden.length,   alert: true  },
          { key: 'approved',  icon: '✓',  label: 'Concluir',  count: approvedGolden.length,  alert: false },
          { key: 'completed', icon: '✓✓', label: 'Concluídas',count: completedGolden.length, alert: false },
          { key: 'base',      icon: '👥', label: 'Base',       count: basePlayers.length,     alert: false },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key as typeof tab); setSelected(new Set()) }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
            style={{ color: tab === t.key ? '#F97316' : '#6B7280', minHeight: 56 }}
          >
            <div className="relative">
              <span className="text-lg leading-none">{t.icon}</span>
              {t.count > 0 && (
                <span className={`absolute -top-1 -right-2 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center leading-none ${
                  t.alert ? 'bg-yellow-500 text-black' : 'bg-orange-500 text-black'
                }`}>{t.count > 9 ? '9+' : t.count}</span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Confirm Modal ─────────────────────────────────────────── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#1C1C1C] border border-white/[0.10] rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 ${
                confirmAction.type === 'reject' ? 'bg-red-500/10' :
                confirmAction.type === 'approve' ? 'bg-green-500/10' : 'bg-blue-500/10'
              }`}>
                {confirmAction.type === 'reject' ? '✕' : confirmAction.type === 'approve' ? '✓' : '✓✓'}
              </div>
              <p className="text-center font-semibold text-white text-lg">
                {confirmAction.type === 'reject' ? 'Recusar' :
                 confirmAction.type === 'approve' ? 'Aprovar' : 'Concluir'} {confirmAction.label}?
              </p>
              <p className="text-center text-gray-500 text-sm mt-2">
                {confirmAction.type === 'reject'
                  ? 'Essa ação não pode ser desfeita.'
                  : confirmAction.type === 'approve'
                  ? 'A ficha será enviada para conclusão.'
                  : 'A ficha será marcada como concluída.'}
              </p>
            </div>
            <div className="flex border-t border-white/[0.06]">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-4 text-sm font-medium text-gray-400 hover:text-white transition-colors border-r border-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                onClick={executeConfirmed}
                disabled={isPending}
                className={`flex-1 py-4 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  confirmAction.type === 'reject'
                    ? 'text-red-400 hover:text-red-300'
                    : 'text-green-400 hover:text-green-300'
                }`}
              >
                {isPending ? 'Aguarde...' :
                 confirmAction.type === 'reject' ? 'Sim, recusar' :
                 confirmAction.type === 'approve' ? 'Sim, aprovar' : 'Sim, concluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
