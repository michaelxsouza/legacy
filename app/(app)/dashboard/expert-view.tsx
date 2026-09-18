'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { createGoldenToken, createBasePlayers } from '@/lib/actions/demands'
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
  notes?: string | null
}

type Metrics = {
  goldenTotal: number
  goldenPending: number
  goldenApproved: number
  goldenCompleted: number
  goldenValueCents: number
  baseTotal: number
}

type Props = {
  dateStr: string
  metrics: Metrics
  demands: Demand[]
  organizationName: string
  userName: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  PENDING:   { label: 'Aguardando aprovação', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', icon: '⏳' },
  APPROVED:  { label: 'Aprovada',             color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',    icon: '✓' },
  COMPLETED: { label: 'Concluída',            color: 'bg-green-500/10 text-green-400 border-green-500/30', icon: '✓✓' },
  CANCELLED: { label: 'Recusada',             color: 'bg-red-500/10 text-red-400 border-red-500/30',       icon: '✕' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-500/10 text-gray-400 border-gray-500/30', icon: '' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

function getTodayBR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
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
                <p className="text-xs text-gray-600 mt-1">Você será avisado quando sua ficha for aprovada</p>
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

export function ExpertView({ dateStr, metrics, demands, organizationName, userName }: Props) {
  const [tab, setTab] = useState<'golden' | 'base'>('golden')
  const [notifs, setNotifs] = useState<NotifItem[]>([])
  const [showNotifs, setShowNotifs] = useState(false)

  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const goldenFormRef = useRef<HTMLFormElement>(null)
  const baseFormRef = useRef<HTMLFormElement>(null)
  const [playerNameInput, setPlayerNameInput] = useState('')

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30000)
    return () => clearInterval(id)
  }, [router])

  // Request browser notification permission on first load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Notify Expert when a ficha gets approved
  const prevApprovedRef = useRef(metrics.goldenApproved)
  useEffect(() => {
    const prev = prevApprovedRef.current
    const curr = metrics.goldenApproved
    if (curr > prev) {
      const diff = curr - prev
      const notifBody = `${diff} ficha${diff > 1 ? 's' : ''} sua${diff > 1 ? 's' : ''} aprovada${diff > 1 ? 's' : ''} pelo Gerente`
      setNotifs(prev => [{
        id: Date.now().toString(),
        title: '🎉 Ficha aprovada!',
        body: notifBody,
        time: new Date(),
        read: false,
      }, ...prev].slice(0, 30))
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Legacy — Ficha aprovada!', {
            body: notifBody,
            icon: '/favicon.ico',
            tag: 'legacy-approved',
          })
        } catch (_) {}
      }
    }
    prevApprovedRef.current = curr
  }, [metrics.goldenApproved])

  const goldenDemands = demands.filter(d => d.type === 'GOLDEN_TOKEN')
  const baseDemands = demands.filter(d => d.type === 'BASE_PLAYER')

  function handleGolden(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createGoldenToken(fd)
      if (res && 'error' in res) toast.error(res.error)
      else { toast.success('Ficha Dourada enviada! Aguardando aprovação do Admin.'); goldenFormRef.current?.reset(); setPlayerNameInput(''); router.refresh() }
    })
  }

  function handleBase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createBasePlayers(fd)
      if (res && 'error' in res) toast.error(res.error)
      else {
        const r = res as { success: boolean; added?: string[]; skipped?: string[] }
        let msg = `${r.added?.length ?? 0} jogador(es) adicionado(s).`
        if (r.skipped?.length) msg += ` ${r.skipped.length} já existia(m).`
        toast.success(msg)
        baseFormRef.current?.reset()
        router.refresh()
      }
    })
  }

  const prevDate = new Date(dateStr + 'T12:00:00Z')
  prevDate.setDate(prevDate.getDate() - 1)
  const nextDate = new Date(dateStr + 'T12:00:00Z')
  nextDate.setDate(nextDate.getDate() + 1)
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center text-black font-black text-sm">L</div>
            <div>
              <p className="font-semibold text-white leading-tight">{organizationName}</p>
              <p className="text-xs text-gray-500">Painel do Expert</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{userName}</span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 uppercase tracking-wider">Expert</span>
            <NotificationBell
              notifs={notifs}
              isOpen={showNotifs}
              onToggle={() => {
                setShowNotifs(v => !v)
                setNotifs(prev => prev.map(n => ({ ...n, read: true })))
              }}
              onMarkAllRead={() => setNotifs(prev => prev.map(n => ({ ...n, read: true })))}
            />
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-8">
        {/* Date navigation */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Minhas Submissões</h1>
            <p className="text-gray-500 text-sm mt-1">Envie e acompanhe suas fichas</p>
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

        {/* My stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl p-4 bg-yellow-500/5 border border-yellow-500/10">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1.5">Aguardando</p>
            <p className="text-2xl font-bold text-yellow-400">{metrics.goldenPending}</p>
          </div>
          <div className="rounded-xl p-4 bg-blue-500/5 border border-blue-500/10">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1.5">Aprovadas</p>
            <p className="text-2xl font-bold text-blue-400">{metrics.goldenApproved}</p>
          </div>
          <div className="rounded-xl p-4 bg-green-500/5 border border-green-500/10">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1.5">Concluídas</p>
            <p className="text-2xl font-bold text-green-400">{metrics.goldenCompleted}</p>
          </div>
          <div className="rounded-xl p-4 bg-orange-500/5 border border-orange-500/20">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1.5">Valor Total</p>
            <p className="text-xl font-bold text-orange-400">{formatBRL(metrics.goldenValueCents)}</p>
          </div>
        </div>

        {/* Tabs — hidden on mobile (replaced by bottom nav) */}
        <div className="hidden md:flex gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab('golden')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'golden' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}
          >
            🏆 Fichas Douradas
            {goldenDemands.length > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold ${tab === 'golden' ? 'bg-black/20 text-black' : 'bg-white/10 text-white'}`}>
                {goldenDemands.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('base')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'base' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}
          >
            👥 Jogadores na Base
            {baseDemands.length > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold ${tab === 'base' ? 'bg-black/20 text-black' : 'bg-white/10 text-white'}`}>
                {baseDemands.length}
              </span>
            )}
          </button>
        </div>

        {/* GOLDEN TOKEN TAB */}
        {tab === 'golden' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Form */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 sticky top-24">
                <h3 className="font-semibold text-white mb-5 flex items-center gap-2">
                  <span className="text-orange-400">🏆</span>
                  Nova Ficha Dourada
                </h3>

                <form ref={goldenFormRef} onSubmit={handleGolden} className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">ID do Jogador</label>
                    <input name="playerId" placeholder="Opcional" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Nome do Jogador <span className="text-red-400">*</span></label>
                    <input
                      name="playerName"
                      required
                      placeholder="Ex: João Silva"
                      value={playerNameInput}
                      onChange={e => setPlayerNameInput(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50"
                    />
                    {playerNameInput.length > 2 && goldenDemands.some(d => d.playerName.toLowerCase() === playerNameInput.toLowerCase()) && (
                      <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/[0.08] border border-yellow-500/20">
                        <span className="text-yellow-400 text-xs">⚠️</span>
                        <p className="text-xs text-yellow-300">Ficha para este jogador já foi enviada hoje.</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Valor (R$) <span className="text-red-400">*</span></label>
                    <input name="amount" required placeholder="Ex: 150,00" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Data operacional <span className="text-red-400">*</span></label>
                    <input name="operationalDate" type="date" defaultValue={dateStr} required className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Corte <span className="text-red-400">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {[{ value: 'CUT_12', label: '12:00' }, { value: 'CUT_18', label: '18:00' }].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:border-orange-500/30 transition-colors has-[:checked]:border-orange-500/50 has-[:checked]:bg-orange-500/5">
                          <input type="radio" name="cutoff" value={opt.value} defaultChecked={opt.value === 'CUT_12'} className="accent-orange-500" />
                          <span className="text-sm font-medium">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full py-3 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-colors disabled:opacity-50 mt-2"
                  >
                    {isPending ? 'Enviando...' : 'Enviar Ficha Dourada'}
                  </button>
                </form>
              </div>
            </div>

            {/* List */}
            <div className="lg:col-span-3 space-y-3">
              <h3 className="text-sm font-medium text-gray-400">Minhas fichas do dia</h3>
              {goldenDemands.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
                  <p className="text-gray-600 text-sm">Nenhuma ficha enviada ainda hoje</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {goldenDemands.map(d => (
                    <div key={d.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">{d.playerName}</span>
                          {d.playerId && <span className="text-xs text-gray-600 font-mono">#{d.playerId}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span className="font-mono bg-white/[0.04] rounded px-1.5 py-0.5 border border-white/[0.06]">{d.cutoff === 'CUT_12' ? '12:00' : '18:00'}</span>
                          <span>{formatDateTime(d.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-orange-400 font-bold text-base">{d.amountInCents ? formatBRL(d.amountInCents) : '—'}</span>
                        <StatusBadge status={d.status} />
                      </div>
                      </div>
                    {d.status === 'CANCELLED' && d.notes && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/[0.06] border border-red-500/20">
                        <span className="text-red-400 text-xs mt-0.5 flex-shrink-0">✕</span>
                        <p className="text-xs text-red-300 leading-relaxed"><span className="font-medium">Motivo:</span> {d.notes}</p>
                      </div>
                    )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* BASE PLAYERS TAB */}
        {tab === 'base' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Form */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 sticky top-24">
                <h3 className="font-semibold text-white mb-5 flex items-center gap-2">
                  <span>👥</span>
                  Jogadores na Base
                </h3>
                <form ref={baseFormRef} onSubmit={handleBase} className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Data operacional</label>
                    <input name="operationalDate" type="date" defaultValue={dateStr} required className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Corte</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[{ value: 'CUT_12', label: '12:00' }, { value: 'CUT_18', label: '18:00' }].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:border-orange-500/30 transition-colors has-[:checked]:border-orange-500/50 has-[:checked]:bg-orange-500/5">
                          <input type="radio" name="cutoff" value={opt.value} defaultChecked={opt.value === 'CUT_12'} className="accent-orange-500" />
                          <span className="text-sm font-medium">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Jogadores</label>
                    <p className="text-xs text-gray-600 mb-2">Um por linha, ou separados por vírgula. Pode usar "ID — Nome".</p>
                    <textarea
                      name="playersRaw"
                      required
                      rows={8}
                      placeholder={"12345 — João Silva\n67890 — Pedro Santos\nMaria Oliveira"}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full py-3 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-colors disabled:opacity-50"
                  >
                    {isPending ? 'Adicionando...' : 'Adicionar Jogadores'}
                  </button>
                </form>
              </div>
            </div>

            {/* List */}
            <div className="lg:col-span-3 space-y-3">
              <h3 className="text-sm font-medium text-gray-400">Jogadores adicionados hoje ({baseDemands.length})</h3>
              {baseDemands.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
                  <p className="text-gray-600 text-sm">Nenhum jogador adicionado ainda</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {baseDemands.map(d => (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">
                        {d.playerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{d.playerName}</p>
                        <p className="text-xs text-gray-600">{d.playerId ? `#${d.playerId} · ` : ''}{d.cutoff === 'CUT_12' ? 'Corte 12h' : 'Corte 18h'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Spacer */}
      <div className="mobile-nav-spacer" />

      {/* Mobile bottom nav */}
      <nav className="mobile-bottom-nav">
        <button
          onClick={() => setTab('golden')}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
          style={{ color: tab === 'golden' ? '#F97316' : '#6B7280', minHeight: 56 }}
        >
          <div className="relative">
            <span className="text-xl leading-none">🏆</span>
            {goldenDemands.length > 0 && (
              <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-orange-500 text-black text-[9px] font-bold flex items-center justify-center leading-none">
                {goldenDemands.length > 9 ? '9+' : goldenDemands.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium leading-none">Fichas</span>
        </button>
        <button
          onClick={() => setTab('base')}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
          style={{ color: tab === 'base' ? '#F97316' : '#6B7280', minHeight: 56 }}
        >
          <div className="relative">
            <span className="text-xl leading-none">👥</span>
            {baseDemands.length > 0 && (
              <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-orange-500 text-black text-[9px] font-bold flex items-center justify-center leading-none">
                {baseDemands.length > 9 ? '9+' : baseDemands.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium leading-none">Base</span>
        </button>
      </nav>
    </div>
  )
}
