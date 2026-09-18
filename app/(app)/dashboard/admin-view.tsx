'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { approveDemands, rejectDemands, cancelDemand, getAuditLogs } from '@/lib/actions/demands'
import { createUser, toggleUserActive, resetUserPassword } from '@/lib/actions/users'
import { formatBRL, formatDateTime } from '@/lib/utils'
import { Cutoff } from '@prisma/client'

type Demand = {
  id: string; type: string; status: string; playerName: string; playerId: string | null
  amountInCents: number | null; cutoff: Cutoff; operationalDate: Date | string
  createdAt: Date | string; createdBy: { id: string; name: string }
  approvedBy: { name: string } | null; completedBy: { name: string } | null
  cancelledBy: { name: string } | null; notes?: string | null
}
type Metrics = { goldenTotal: number; goldenPending: number; goldenApproved: number; goldenCompleted: number; goldenValueCents: number; baseTotal: number }
type User = { id: string; name: string; email: string; role: string; active: boolean; createdAt: Date | string }
type AuditLog = { id: string; action: string; entityType: string; entityId: string; actorId: string; createdAt: Date | string; actor: { name: string; role: string }; afterJson?: any; beforeJson?: any }
type WeeklyStat = { date: string; label: string; golden: number; base: number; valueCents: number }
type Props = {
  dateStr: string; metrics: Metrics; demands: Demand[]; organizationName: string; userName: string
  users: User[]; auditLogs: AuditLog[]; weeklyStats: WeeklyStat[]
  expertStats: Record<string, { total: number; approved: number; completed: number; valueCents: number }>
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:   { label: 'Pendente',  color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  APPROVED:  { label: 'Aprovada',  color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  COMPLETED: { label: 'Concluída', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  CANCELLED: { label: 'Recusada',  color: 'bg-red-500/10 text-red-400 border-red-500/30' },
}
const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  ADMIN:   { label: 'Admin',   color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  MANAGER: { label: 'Gerente', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  EXPERT:  { label: 'Expert',  color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
}
const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  APPROVE:  { label: 'Aprovação',    color: 'text-green-400' },
  REJECT:   { label: 'Recusa',       color: 'text-red-400' },
  CANCEL:   { label: 'Cancelamento', color: 'text-red-400' },
  COMPLETE: { label: 'Conclusão',    color: 'text-blue-400' },
  CREATE:   { label: 'Criação',      color: 'text-gray-400' },
}

// ── SVG Icons ────────────────────────────────────────────────────────────────
const IC = {
  total:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7 3h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  clock:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>,
  check:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  star:   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>,
  money:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  users:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
  search: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>,
  dl:     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>,
}

// ── Badges ────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>
}
function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role] ?? { label: role, color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>
}

// ── MetricCard ────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, accent, alert, icon }: { label: string; value: string | number; sub?: string; accent?: boolean; alert?: boolean; icon: React.ReactNode }) {
  const isEmpty = value === 0 || value === '0' || value === 'R$ 0,00'
  return (
    <div className={`rounded-xl p-4 border ${alert ? 'bg-red-500/5 border-red-500/20' : accent && !isEmpty ? 'bg-orange-500/5 border-orange-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
      <div className={`flex items-center gap-2 mb-3 ${alert ? 'text-red-400' : accent && !isEmpty ? 'text-orange-400' : 'text-gray-500'}`}>
        {icon}
        <p className="text-xs uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className={`text-2xl font-bold leading-none ${alert ? 'text-red-400' : accent && !isEmpty ? 'text-orange-400' : isEmpty && !alert ? 'text-gray-600' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1.5">{sub}</p>}
    </div>
  )
}

// ── CountdownTimer ────────────────────────────────────────────────────────────
function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState('')
  const [nextCutoff, setNextCutoff] = useState('')
  useEffect(() => {
    function compute() {
      const brt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
      const totalSec = brt.getHours() * 3600 + brt.getMinutes() * 60 + brt.getSeconds()
      const cut12 = 12 * 3600, cut18 = 18 * 3600
      let target: number, label: string
      if (totalSec < cut12)      { target = cut12;         label = '12:00' }
      else if (totalSec < cut18) { target = cut18;         label = '18:00' }
      else                       { target = cut12 + 86400; label = '12:00 amanhã' }
      const diff = target - totalSec
      setTimeLeft(`${String(Math.floor(diff / 3600)).padStart(2,'0')}:${String(Math.floor((diff % 3600) / 60)).padStart(2,'0')}:${String(diff % 60).padStart(2,'0')}`)
      setNextCutoff(label)
    }
    compute()
    const id = setInterval(compute, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5">
      <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
      <div>
        <p className="text-[10px] text-gray-500 leading-none uppercase tracking-wider">Próximo corte · {nextCutoff}</p>
        <p className="text-lg font-bold font-mono text-orange-400 leading-tight">{timeLeft}</p>
      </div>
    </div>
  )
}

// ── WeeklyChart (dual bars: fichas + valor) ───────────────────────────────────
function WeeklyChart({ stats }: { stats: WeeklyStat[] }) {
  if (!stats.length) return null
  const maxG = Math.max(...stats.map(s => s.golden), 1)
  const maxV = Math.max(...stats.map(s => s.valueCents), 1)
  const H = 72
  const weekTotal = stats.reduce((s, d) => s + d.valueCents, 0)
  const weekCount = stats.reduce((s, d) => s + d.golden, 0)
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Fichas Douradas — últimos 7 dias</h3>
          <p className="text-xs text-gray-500 mt-0.5">{weekCount} fichas · {formatBRL(weekTotal)} em valor</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500/70 inline-block" />Fichas</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40 inline-block" />Valor</span>
        </div>
      </div>
      <div className="flex items-end gap-2" style={{ height: 96 }}>
        {stats.map(s => {
          const hG = Math.round((s.golden / maxG) * H)
          const hV = Math.round((s.valueCents / maxV) * H)
          return (
            <div key={s.date} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white whitespace-nowrap shadow-2xl min-w-[130px]">
                  <p className="font-semibold text-white mb-1">{s.label}</p>
                  <p className="flex justify-between gap-4"><span className="text-gray-400">Fichas</span><span className="text-orange-400 font-medium">{s.golden}</span></p>
                  <p className="flex justify-between gap-4"><span className="text-gray-400">Base</span><span className="text-gray-300 font-medium">{s.base}</span></p>
                  <p className="flex justify-between gap-4 mt-1 pt-1 border-t border-white/[0.08]"><span className="text-gray-400">Valor</span><span className="text-blue-400 font-medium">{formatBRL(s.valueCents)}</span></p>
                </div>
                <div className="w-2 h-2 bg-[#1C1C1C] border-r border-b border-white/10 rotate-45 -mt-1" />
              </div>
              <div className="w-full flex items-end gap-0.5" style={{ height: H + 'px' }}>
                <div className={`flex-1 rounded-t-sm transition-colors ${s.golden === 0 ? 'bg-white/[0.04]' : 'bg-orange-500/70 hover:bg-orange-500'}`} style={{ height: (s.golden === 0 ? 8 : Math.max(hG, 3)) + 'px' }} />
                <div className={`flex-1 rounded-t-sm transition-colors ${s.valueCents === 0 ? 'bg-white/[0.03]' : 'bg-blue-500/40 hover:bg-blue-500/60'}`} style={{ height: (s.valueCents === 0 ? 8 : Math.max(hV, 3)) + 'px' }} />
              </div>
              <p className="text-[10px] text-gray-600 text-center leading-tight">{s.label.split(', ')[0]}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ExpertLeaderboard ─────────────────────────────────────────────────────────
function ExpertLeaderboard({ users, demands, expertStats }: { users: User[]; demands: Demand[]; expertStats: Props['expertStats'] }) {
  const experts = users.filter(u => u.role === 'EXPERT' && u.active)
  if (!experts.length) return null
  const rows = experts.map(u => {
    const today = demands.filter(d => d.type === 'GOLDEN_TOKEN' && d.createdBy.id === u.id)
    const w7 = expertStats[u.id] ?? { total: 0, approved: 0, completed: 0, valueCents: 0 }
    return { id: u.id, name: u.name, todayCount: today.length, pending: today.filter(d => d.status === 'PENDING').length, weekCount: w7.total, weekValue: w7.valueCents }
  }).sort((a, b) => b.todayCount - a.todayCount)
  const maxW = Math.max(...rows.map(r => r.weekCount), 1)
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 h-full">
      <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2 mb-4"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Performance Experts — hoje</h3>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 font-mono w-4 text-right flex-shrink-0">{i + 1}</span>
            <div className="w-7 h-7 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400 text-[10px] font-bold flex-shrink-0">{r.name.charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-200 truncate">{r.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {r.pending > 0 && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-1.5 py-0.5">{r.pending} pend.</span>}
                  <span className="text-xs text-gray-400">{r.todayCount}</span>
                </div>
              </div>
              <div className="w-full bg-white/[0.04] rounded-full h-1">
                <div className="bg-blue-500/60 h-1 rounded-full" style={{ width: `${Math.round((r.weekCount / maxW) * 100)}%` }} />
              </div>
              <p className="text-[10px] text-gray-600 mt-0.5">{r.weekCount} na semana · {formatBRL(r.weekValue)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modais ────────────────────────────────────────────────────────────────────
function RejectModal({ ids, onConfirm, onClose }: { ids: string[]; onConfirm: (r: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#1A1A1A] border border-white/[0.10] rounded-2xl p-6 shadow-2xl">
        <h3 className="font-semibold text-white mb-1">Recusar {ids.length} ficha{ids.length !== 1 ? 's' : ''}</h3>
        <p className="text-sm text-gray-500 mb-5">Informe o motivo da recusa (o Expert verá esta mensagem).</p>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Ex: Limite de fichas do dia atingido" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none mb-5" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20 text-sm font-medium transition-colors">Cancelar</button>
          <button onClick={() => onConfirm(reason.trim())} className="flex-1 py-2.5 rounded-xl bg-red-500/90 hover:bg-red-500 text-white text-sm font-semibold transition-colors">Confirmar recusa</button>
        </div>
      </div>
    </div>
  )
}
function ResetPwdModal({ userName, onConfirm, onClose }: { userName: string; onConfirm: (p: string) => void; onClose: () => void }) {
  const [pwd, setPwd] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#1A1A1A] border border-white/[0.10] rounded-2xl p-6 shadow-2xl">
        <h3 className="font-semibold text-white mb-1">Redefinir senha</h3>
        <p className="text-sm text-gray-500 mb-5">Nova senha para <span className="text-white font-medium">{userName}</span>.</p>
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} minLength={6} placeholder="Mínimo 6 caracteres" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 mb-5" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20 text-sm font-medium transition-colors">Cancelar</button>
          <button onClick={() => pwd.length >= 6 && onConfirm(pwd)} disabled={pwd.length < 6} className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold transition-colors disabled:opacity-40">Redefinir</button>
        </div>
      </div>
    </div>
  )
}

// ── CSV ───────────────────────────────────────────────────────────────────────
function exportCSV(demands: Demand[], dateStr: string) {
  const header = ['Jogador', 'ID', 'Tipo', 'Valor', 'Corte', 'Status', 'Expert', 'Aprovado por', 'Concluído por', 'Criado em']
  const rows = demands.map(d => [d.playerName, d.playerId ?? '', d.type === 'GOLDEN_TOKEN' ? 'Ficha Dourada' : 'Jogador na Base', d.amountInCents ? (d.amountInCents / 100).toFixed(2) : '', d.cutoff === 'CUT_12' ? '12:00' : '18:00', STATUS_CONFIG[d.status]?.label ?? d.status, d.createdBy.name, d.approvedBy?.name ?? '', d.completedBy?.name ?? '', new Date(d.createdAt).toLocaleString('pt-BR')])
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `legacy-fichas-${dateStr}.csv` })
  a.click(); URL.revokeObjectURL(url)
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

// ── AdminView ─────────────────────────────────────────────────────────────────
export function AdminView({ dateStr, metrics, demands, organizationName, userName, users, auditLogs, weeklyStats, expertStats }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'queue' | 'all' | 'users' | 'history'>('queue')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filterCutoff, setFilterCutoff] = useState('ALL')
  const [filterExpert, setFilterExpert] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [searchAll, setSearchAll] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('ALL')
  const [isPending, startTransition] = useTransition()
  const [rejectModal, setRejectModal] = useState<{ ids: string[] } | null>(null)
  const [resetPwdModal, setResetPwdModal] = useState<{ userId: string; userName: string } | null>(null)
  const [historyPeriod, setHistoryPeriod] = useState<'today' | '7d' | '30d'>('today')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [localAuditLogs, setLocalAuditLogs] = useState(auditLogs)
  const [historyActorFilter, setHistoryActorFilter] = useState('ALL')
  const [historyActionFilter, setHistoryActionFilter] = useState('ALL')

  useEffect(() => { const id = setInterval(() => router.refresh(), 30000); return () => clearInterval(id) }, [router])

  const pendingGolden = demands.filter(d => d.type === 'GOLDEN_TOKEN' && d.status === 'PENDING')
  const allGolden = demands.filter(d => d.type === 'GOLDEN_TOKEN')
  const basePlayers = demands.filter(d => d.type === 'BASE_PLAYER')
  const byExpert: Record<string, { expertName: string; demands: Demand[] }> = {}
  for (const d of pendingGolden) {
    if (!byExpert[d.createdBy.id]) byExpert[d.createdBy.id] = { expertName: d.createdBy.name, demands: [] }
    byExpert[d.createdBy.id].demands.push(d)
  }
  const uniqueExperts = [...new Set(demands.map(d => d.createdBy.name))]
  const q = searchAll.toLowerCase()
  const filtered = demands.filter(d => {
    if (d.type !== 'GOLDEN_TOKEN') return false
    if (filterCutoff !== 'ALL' && d.cutoff !== filterCutoff) return false
    if (filterExpert !== 'ALL' && d.createdBy.name !== filterExpert) return false
    if (filterStatus !== 'ALL' && d.status !== filterStatus) return false
    if (q && !d.playerName.toLowerCase().includes(q) && !(d.playerId || '').includes(q) && !d.createdBy.name.toLowerCase().includes(q)) return false
    return true
  })
  const selectedValue = demands.filter(d => selected.has(d.id)).reduce((s, d) => s + (d.amountInCents || 0), 0)
  const pendingValueTotal = pendingGolden.reduce((s, d) => s + (d.amountInCents || 0), 0)
  const filteredTotal = filtered.reduce((s, d) => s + (d.amountInCents || 0), 0)

  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (ids: string[]) => setSelected(p => { const allSel = ids.every(id => p.has(id)); const n = new Set(p); ids.forEach(id => allSel ? n.delete(id) : n.add(id)); return n })

  function handleApprove(ids: string[]) {
    startTransition(async () => {
      try { await approveDemands(ids); setSelected(new Set()); toast.success(`${ids.length} ficha${ids.length !== 1 ? 's' : ''} aprovada${ids.length !== 1 ? 's' : ''}`); router.refresh() }
      catch { toast.error('Erro ao aprovar fichas') }
    })
  }
  function handleReject(ids: string[], reason?: string) {
    setRejectModal(null)
    startTransition(async () => {
      try { await rejectDemands(ids, reason); setSelected(new Set()); toast.success(`${ids.length} ficha${ids.length !== 1 ? 's' : ''} recusada${ids.length !== 1 ? 's' : ''}`); router.refresh() }
      catch { toast.error('Erro ao recusar fichas') }
    })
  }
  function handleResetPwd(userId: string, password: string) {
    setResetPwdModal(null)
    startTransition(async () => {
      try { await resetUserPassword(userId, password); toast.success('Senha redefinida com sucesso') }
      catch { toast.error('Erro ao redefinir senha') }
    })
  }
  async function handleHistoryPeriod(period: 'today' | '7d' | '30d') {
    setHistoryPeriod(period)
    if (period === 'today') { setLocalAuditLogs(auditLogs); return }
    setHistoryLoading(true)
    try {
      const days = period === '7d' ? 6 : 29
      const startD = new Date(dateStr + 'T12:00:00Z'); startD.setDate(startD.getDate() - days)
      const logs = await getAuditLogs(startD.toISOString().slice(0, 10), dateStr)
      setLocalAuditLogs(logs as any)
    } catch { toast.error('Erro ao carregar histórico') }
    finally { setHistoryLoading(false) }
  }
  function handleCancel(id: string) {
    startTransition(async () => {
      try { await cancelDemand(id); toast.success('Demanda cancelada'); router.refresh() }
      catch { toast.error('Erro ao cancelar demanda') }
    })
  }
  function handleToggleUser(userId: string, active: boolean) {
    startTransition(async () => {
      try { await toggleUserActive(userId); toast.success(active ? 'Usuário desativado' : 'Usuário reativado'); router.refresh() }
      catch { toast.error('Erro ao atualizar usuário') }
    })
  }
  async function handleAddUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const res = await createUser(fd)
        if (res && 'error' in res) toast.error(res.error)
        else { setShowAddUser(false); (e.target as HTMLFormElement).reset(); toast.success('Usuário cadastrado'); router.refresh() }
      } catch { toast.error('Erro ao cadastrar usuário') }
    })
  }

  const prevDate = new Date(dateStr + 'T12:00:00Z'); prevDate.setDate(prevDate.getDate() - 1)
  const nextDate = new Date(dateStr + 'T12:00:00Z'); nextDate.setDate(nextDate.getDate() + 1)
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
  const tabs = [
    { key: 'queue', label: 'Fila de Aprovação', badge: pendingGolden.length },
    { key: 'all', label: 'Fichas Douradas', badge: allGolden.length },
    { key: 'users', label: 'Usuários', badge: users.length },
    { key: 'history', label: 'Histórico', badge: auditLogs.length },
  ] as const

  // ── render ──
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">

      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#0A0A0A]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center text-black font-black text-sm select-none">L</div>
            <div>
              <p className="font-semibold text-white leading-tight text-sm">{organizationName}</p>
              <p className="text-[11px] text-gray-500 leading-tight">Painel Administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <CountdownTimer />
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-white/[0.06]">
              <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold">{userName.charAt(0).toUpperCase()}</div>
              <span className="text-sm text-gray-300 font-medium hidden md:block">{userName}</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30 uppercase tracking-wider">Admin</span>
            </div>
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]">
              Sair
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">

        {/* Title + date nav */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-gray-500 text-sm">Visão geral operacional</p>
              <LastRefreshed />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dateStr !== fmtDate(new Date()) && (
              <a href="/dashboard" className="text-xs font-medium text-orange-400 hover:text-orange-300 border border-orange-500/30 hover:border-orange-400/50 bg-orange-500/5 hover:bg-orange-500/10 px-3 py-1.5 rounded-lg transition-all">Hoje</a>
            )}
            <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.08] rounded-xl p-1">
              <a href={`/dashboard?date=${fmtDate(prevDate)}`} className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </a>
              <label className="relative cursor-pointer">
                <span className="text-sm font-medium px-3 py-1.5 text-gray-200 hover:text-white transition-colors whitespace-nowrap select-none">
                  {new Date(dateStr + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                </span>
                <input type="date" value={dateStr} max={fmtDate(new Date())} onChange={e => e.target.value && router.push(`/dashboard?date=${e.target.value}`)} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
              </label>
              <a href={dateStr >= fmtDate(new Date()) ? '#' : `/dashboard?date=${fmtDate(nextDate)}`} className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${dateStr >= fmtDate(new Date()) ? 'text-gray-700 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'}`} aria-disabled={dateStr >= fmtDate(new Date())}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </a>
            </div>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total Fichas"   value={metrics.goldenTotal}              icon={IC.total} />
          <MetricCard label="Pendentes"      value={metrics.goldenPending}            icon={IC.clock} alert={metrics.goldenPending > 0} sub={pendingValueTotal > 0 ? formatBRL(pendingValueTotal) : undefined} />
          <MetricCard label="Aprovadas"      value={metrics.goldenApproved}           icon={IC.check} />
          <MetricCard label="Concluídas"     value={metrics.goldenCompleted}          icon={IC.star} />
          <MetricCard label="Valor Total"    value={formatBRL(metrics.goldenValueCents)} icon={IC.money} accent sub="aprovadas + concluídas" />
          <MetricCard label="Base"           value={metrics.baseTotal}               icon={IC.users} />
        </div>

        {/* Chart + Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><WeeklyChart stats={weeklyStats} /></div>
          <div><ExpertLeaderboard users={users} demands={demands} expertStats={expertStats} /></div>
        </div>

        {/* Tabs */}
        <div>
          <div className="hidden md:flex gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1 w-fit">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === t.key ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>
                {t.label}
                {t.badge > 0 && <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold ${tab === t.key ? 'bg-black/20 text-black' : t.key === 'queue' && pendingGolden.length > 0 ? 'bg-red-500 text-white' : 'bg-white/10 text-white'}`}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* ── QUEUE ── */}
          {tab === 'queue' && (
            <div className="mt-5 space-y-5">
              {pendingGolden.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-14 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 mx-auto mb-4">{IC.check}</div>
                  <p className="text-gray-300 font-semibold">Fila limpa</p>
                  <p className="text-gray-600 text-sm mt-1">Todas as solicitações foram processadas</p>
                </div>
              ) : (
                <>
                  {selected.size > 0 && (
                    <div className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/20 rounded-xl px-5 py-3">
                      <div>
                        <span className="text-sm font-semibold text-orange-400">{selected.size} selecionadas</span>
                        {selectedValue > 0 && <span className="text-xs text-gray-500 ml-2">· {formatBRL(selectedValue)}</span>}
                      </div>
                      <div className="flex-1" />
                      <button onClick={() => setRejectModal({ ids: [...selected] })} disabled={isPending} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">Recusar</button>
                      <button onClick={() => handleApprove([...selected])} disabled={isPending} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50">Aprovar</button>
                    </div>
                  )}
                  {Object.values(byExpert).map(({ expertName, demands: eds }) => {
                    const groupValue = eds.reduce((s, d) => s + (d.amountInCents || 0), 0)
                    return (
                      <div key={expertName} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.035]">
                          <div className="flex items-center gap-3">
                            <input type="checkbox" className="accent-orange-500 w-4 h-4" checked={eds.every(d => selected.has(d.id))} onChange={() => toggleAll(eds.map(d => d.id))} />
                            <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold">{expertName.charAt(0).toUpperCase()}</div>
                            <div>
                              <span className="font-semibold text-sm text-white">{expertName}</span>
                              <span className="text-xs text-gray-500 ml-2">{eds.length} ficha{eds.length !== 1 ? 's' : ''}</span>
                              {groupValue > 0 && <span className="text-xs text-orange-400 ml-2 font-medium">· {formatBRL(groupValue)}</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setRejectModal({ ids: eds.map(d => d.id) })} disabled={isPending} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">Recusar todos</button>
                            <button onClick={() => handleApprove(eds.map(d => d.id))} disabled={isPending} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50">Aprovar todos</button>
                          </div>
                        </div>
                        <div className="mobile-cards p-3">
                          {eds.map(d => (
                            <div key={d.id} className="demand-card">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0"><p className="font-semibold text-white">{d.playerName}</p>{d.playerId && <p className="text-xs text-gray-500 font-mono mt-0.5">#{d.playerId}</p>}</div>
                                <div className="text-right shrink-0"><p className="text-orange-400 font-bold text-base">{d.amountInCents ? formatBRL(d.amountInCents) : '—'}</p><p className="text-xs text-gray-600 mt-0.5">{d.cutoff === 'CUT_12' ? '12:00' : '18:00'}</p></div>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => setRejectModal({ ids: [d.id] })} disabled={isPending} className="flex-1 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform">✕ Recusar</button>
                                <button onClick={() => handleApprove([d.id])} disabled={isPending} className="flex-1 py-2 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform">✓ Aprovar</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="desktop-table overflow-x-auto">
                          <table className="w-full text-sm min-w-[540px]">
                            <thead><tr className="border-b border-white/[0.04]">
                              <th className="w-10 px-5 py-3" />
                              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Jogador</th>
                              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">ID</th>
                              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Valor</th>
                              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Corte</th>
                              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Solicitado</th>
                              <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium uppercase tracking-wider">Ações</th>
                            </tr></thead>
                            <tbody>
                              {eds.map(d => (
                                <tr key={d.id} className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${selected.has(d.id) ? 'bg-orange-500/[0.03]' : ''}`}>
                                  <td className="px-5 py-3"><input type="checkbox" className="accent-orange-500 w-4 h-4" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} /></td>
                                  <td className="px-4 py-3 font-medium text-white">{d.playerName}</td>
                                  <td className="px-4 py-3 text-gray-500 font-mono text-xs hidden sm:table-cell">{d.playerId || '—'}</td>
                                  <td className="px-4 py-3 text-orange-400 font-semibold">{d.amountInCents ? formatBRL(d.amountInCents) : '—'}</td>
                                  <td className="px-4 py-3 hidden sm:table-cell"><span className="text-xs bg-white/[0.05] border border-white/[0.08] rounded px-2 py-0.5 font-mono">{d.cutoff === 'CUT_12' ? '12:00' : '18:00'}</span></td>
                                  <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{formatDateTime(d.createdAt)}</td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex gap-1.5 justify-end">
                                      <button onClick={() => setRejectModal({ ids: [d.id] })} disabled={isPending} className="text-xs px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">Recusar</button>
                                      <button onClick={() => handleApprove([d.id])} disabled={isPending} className="text-xs px-2.5 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50">Aprovar</button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
              {basePlayers.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />Jogadores na Base — {dateStr}<span className="text-xs text-gray-500 font-normal">({basePlayers.length})</span></h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {basePlayers.map(d => (
                      <div key={d.id} className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] rounded-lg border border-white/[0.06] text-sm">
                        <span className="text-gray-300 truncate">{d.playerName}</span>
                        {d.playerId && <span className="text-gray-600 text-xs font-mono flex-shrink-0">#{d.playerId}</span>}
                        <span className="ml-auto text-xs text-gray-600 flex-shrink-0">{d.cutoff === 'CUT_12' ? '12h' : '18h'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ALL ── */}
          {tab === 'all' && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">{IC.search}</span>
                  <input value={searchAll} onChange={e => setSearchAll(e.target.value)} placeholder="Buscar jogador, ID ou expert..." className="w-full pl-8 pr-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" />
                </div>
                <select value={filterCutoff} onChange={e => setFilterCutoff(e.target.value)} className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"><option value="ALL">Todos os cortes</option><option value="CUT_12">12:00</option><option value="CUT_18">18:00</option></select>
                <select value={filterExpert} onChange={e => setFilterExpert(e.target.value)} className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"><option value="ALL">Todos os experts</option>{uniqueExperts.map(n => <option key={n} value={n}>{n}</option>)}</select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"><option value="ALL">Todos os status</option><option value="PENDING">Pendente</option><option value="APPROVED">Aprovada</option><option value="COMPLETED">Concluída</option><option value="CANCELLED">Recusada</option></select>
                <button onClick={() => exportCSV(demands, dateStr)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-gray-300 hover:text-white hover:border-white/20 transition-colors">{IC.dl} CSV</button>
                <div className="flex items-center text-xs text-gray-500">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                {filtered.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-500">Nenhuma ficha com esses filtros</p>
                    {(searchAll || filterCutoff !== 'ALL' || filterExpert !== 'ALL' || filterStatus !== 'ALL') && (
                      <button onClick={() => { setSearchAll(''); setFilterCutoff('ALL'); setFilterExpert('ALL'); setFilterStatus('ALL') }} className="mt-3 text-xs text-orange-400 hover:text-orange-300 transition-colors">Limpar filtros</button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead><tr className="border-b border-white/[0.06]">
                        <th className="px-5 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Jogador</th>
                        <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Expert</th>
                        <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Valor</th>
                        <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Corte</th>
                        <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden lg:table-cell">Aprovado por</th>
                        <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden lg:table-cell">Concluído por</th>
                        <th className="px-4 py-3.5 text-right text-xs text-gray-500 font-medium uppercase tracking-wider">Ações</th>
                      </tr></thead>
                      <tbody>
                        {filtered.map(d => (
                          <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.015] transition-colors">
                            <td className="px-5 py-3.5"><div><p className="font-medium text-white">{d.playerName}</p>{d.playerId && <p className="text-xs text-gray-600 font-mono">#{d.playerId}</p>}</div></td>
                            <td className="px-4 py-3.5 text-gray-300 text-xs hidden sm:table-cell">{d.createdBy.name}</td>
                            <td className="px-4 py-3.5 text-orange-400 font-semibold">{d.amountInCents ? formatBRL(d.amountInCents) : '—'}</td>
                            <td className="px-4 py-3.5 hidden md:table-cell"><span className="text-xs bg-white/[0.05] border border-white/[0.08] rounded px-2 py-0.5 font-mono">{d.cutoff === 'CUT_12' ? '12:00' : '18:00'}</span></td>
                            <td className="px-4 py-3.5"><StatusBadge status={d.status} /></td>
                            <td className="px-4 py-3.5 text-gray-500 text-xs hidden lg:table-cell">{d.approvedBy?.name || '—'}</td>
                            <td className="px-4 py-3.5 text-gray-500 text-xs hidden lg:table-cell">{d.completedBy?.name || '—'}</td>
                            <td className="px-4 py-3.5 text-right">
                              {(d.status === 'PENDING' || d.status === 'APPROVED') && (
                                <button onClick={() => handleCancel(d.id)} disabled={isPending} className="text-xs px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">Cancelar</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {filtered.length > 1 && (
                        <tfoot>
                          <tr className="border-t border-white/[0.08] bg-white/[0.02]">
                            <td className="px-5 py-3 text-xs text-gray-500 font-medium">{filtered.length} fichas</td>
                            <td className="hidden sm:table-cell" />
                            <td className="px-4 py-3 text-orange-400 font-bold">{formatBRL(filteredTotal)}</td>
                            <td colSpan={5} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── USERS ── */}
          {tab === 'users' && (
            <div className="mt-5 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{users.length} usuário{users.length !== 1 ? 's' : ''} · {users.filter(u => u.active).length} ativos</p>
                <button onClick={() => setShowAddUser(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-black text-sm font-semibold hover:bg-orange-400 transition-colors">{showAddUser ? '✕ Fechar' : '+ Novo Usuário'}</button>
              </div>
              {showAddUser && (
                <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.03] p-6">
                  <h3 className="font-semibold text-white mb-5">Cadastrar novo usuário</h3>
                  <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Nome completo</label><input name="name" required placeholder="Ex: Lucas Silva" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" /></div>
                    <div><label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">E-mail</label><input name="email" type="email" required placeholder="email@exemplo.com" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" /></div>
                    <div><label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Senha inicial</label><input name="password" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" /></div>
                    <div><label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Papel</label><select name="role" defaultValue="EXPERT" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/50"><option value="EXPERT">Expert</option><option value="MANAGER">Gerente</option><option value="ADMIN">Admin</option></select></div>
                    <div className="md:col-span-2 flex gap-3 pt-2">
                      <button type="button" onClick={() => setShowAddUser(false)} className="px-5 py-2.5 rounded-lg text-sm font-medium border border-white/[0.08] text-gray-400 hover:text-white transition-colors">Cancelar</button>
                      <button type="submit" disabled={isPending} className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-orange-500 text-black hover:bg-orange-400 transition-colors disabled:opacity-50">{isPending ? 'Cadastrando...' : 'Cadastrar usuário'}</button>
                    </div>
                  </form>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">{IC.search}</span>
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Buscar por nome ou e-mail..." className="w-full pl-8 pr-3.5 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" />
                </div>
                <div className="flex gap-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-1">
                  {([{ key: 'ALL', label: 'Todos' }, { key: 'EXPERT', label: 'Expert' }, { key: 'MANAGER', label: 'Gerente' }, { key: 'ADMIN', label: 'Admin' }] as const).map(f => {
                    const count = f.key === 'ALL' ? users.length : users.filter(u => u.role === f.key).length
                    return <button key={f.key} onClick={() => setUserRoleFilter(f.key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${userRoleFilter === f.key ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>{f.label}{count > 0 && <span className={`font-bold ${userRoleFilter === f.key ? 'opacity-70' : 'opacity-40'}`}>{count}</span>}</button>
                  })}
                </div>
              </div>
              {(() => {
                const sq = userSearch.toLowerCase()
                const vis = users.filter(u => {
                  if (sq && !u.name.toLowerCase().includes(sq) && !u.email.toLowerCase().includes(sq)) return false
                  if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false
                  return true
                })
                if (vis.length === 0) return <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-10 text-center text-gray-500">Nenhum usuário encontrado</div>
                const experts = vis.filter(u => u.role === 'EXPERT')
                const others  = vis.filter(u => u.role !== 'EXPERT')
                return (
                  <div className="space-y-6">
                    {experts.length > 0 && (
                      <div>
                        {userRoleFilter === 'ALL' && <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />Experts — {experts.length}</h3>}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {experts.map(u => {
                            const ud = demands.filter(d => d.type === 'GOLDEN_TOKEN' && d.createdBy.id === u.id)
                            const pend = ud.filter(d => d.status === 'PENDING').length
                            const appr = ud.filter(d => d.status === 'APPROVED').length
                            const comp = ud.filter(d => d.status === 'COMPLETED').length
                            const val  = ud.filter(d => d.status === 'APPROVED' || d.status === 'COMPLETED').reduce((s, d) => s + (d.amountInCents || 0), 0)
                            const w7   = expertStats[u.id] ?? { total: 0, approved: 0, completed: 0, valueCents: 0 }
                            return (
                              <div key={u.id} className={`rounded-xl border bg-white/[0.02] p-4 flex flex-col gap-3 transition-all ${!u.active ? 'opacity-50 border-white/[0.04]' : 'border-white/[0.06] hover:border-white/10'}`}>
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400 text-sm font-bold flex-shrink-0">{u.name.charAt(0).toUpperCase()}</div>
                                  <div className="flex-1 min-w-0"><p className="font-semibold text-white text-sm leading-tight truncate">{u.name}</p><p className="text-xs text-gray-500 truncate mt-0.5">{u.email}</p></div>
                                  <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium ${u.active ? 'text-green-400' : 'text-gray-600'}`}><span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-green-400' : 'bg-gray-600'}`} />{u.active ? 'Ativo' : 'Inativo'}</span>
                                </div>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {[{v:pend,l:'Pend.',c:'text-yellow-400',b:'bg-yellow-500/5 border-yellow-500/10'},{v:appr,l:'Aprov.',c:'text-blue-400',b:'bg-blue-500/5 border-blue-500/10'},{v:comp,l:'Concl.',c:'text-green-400',b:'bg-green-500/5 border-green-500/10'}].map(s => (
                                    <div key={s.l} className={`rounded-lg border py-2 text-center ${s.b}`}><p className={`text-base font-bold leading-none ${s.c}`}>{s.v}</p><p className="text-[10px] text-gray-600 mt-1">{s.l}</p></div>
                                  ))}
                                  <div className="rounded-lg bg-orange-500/5 border border-orange-500/10 py-2 text-center"><p className="text-xs font-bold text-orange-400 leading-none">{ud.length > 0 ? formatBRL(val) : '—'}</p><p className="text-[10px] text-gray-600 mt-1">Valor</p></div>
                                </div>
                                <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2">
                                  <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Últimos 7 dias</p>
                                  <div className="flex items-center gap-3 text-xs"><span className="text-gray-400">{w7.total} fichas</span><span className="text-green-400">{w7.completed} concluídas</span><span className="text-orange-400 ml-auto">{w7.valueCents > 0 ? formatBRL(w7.valueCents) : '—'}</span></div>
                                </div>
                                <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                                  <p className="text-xs text-gray-600">Desde {new Date(u.createdAt).toLocaleDateString('pt-BR')}</p>
                                  <div className="flex gap-1.5">
                                    <button onClick={() => setResetPwdModal({ userId: u.id, userName: u.name })} disabled={isPending} className="text-xs px-2.5 py-1 rounded-md border border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50">Senha</button>
                                    <button onClick={() => handleToggleUser(u.id, u.active)} disabled={isPending} className={`text-xs px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50 ${u.active ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'}`}>{u.active ? 'Desativar' : 'Reativar'}</button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {others.length > 0 && (
                      <div>
                        {userRoleFilter === 'ALL' && <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />Admin &amp; Gerentes — {others.length}</h3>}
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
                            <thead><tr className="border-b border-white/[0.06]">
                              <th className="px-5 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Usuário</th>
                              <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">E-mail</th>
                              <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Papel</th>
                              <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Status</th>
                              <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Desde</th>
                              <th className="px-4 py-3.5 text-right text-xs text-gray-500 font-medium uppercase tracking-wider">Ações</th>
                            </tr></thead>
                            <tbody>
                              {others.map(u => (
                                <tr key={u.id} className={`border-b border-white/[0.03] hover:bg-white/[0.015] transition-colors ${!u.active ? 'opacity-50' : ''}`}>
                                  <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 text-xs font-bold flex-shrink-0">{u.name.charAt(0).toUpperCase()}</div><span className="font-medium text-white">{u.name}</span></div></td>
                                  <td className="px-4 py-3.5 text-gray-400 text-xs hidden sm:table-cell">{u.email}</td>
                                  <td className="px-4 py-3.5"><RoleBadge role={u.role} /></td>
                                  <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-green-400' : 'text-gray-600'}`}><span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-green-400' : 'bg-gray-600'}`} />{u.active ? 'Ativo' : 'Inativo'}</span></td>
                                  <td className="px-4 py-3.5 text-gray-600 text-xs hidden md:table-cell">{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                                  <td className="px-4 py-3.5 text-right"><div className="flex gap-1.5 justify-end">
                                    <button onClick={() => setResetPwdModal({ userId: u.id, userName: u.name })} disabled={isPending} className="text-xs px-2.5 py-1 rounded-md border border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50">Senha</button>
                                    <button onClick={() => handleToggleUser(u.id, u.active)} disabled={isPending} className={`text-xs px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50 ${u.active ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'}`}>{u.active ? 'Desativar' : 'Reativar'}</button>
                                  </div></td>
                                </tr>
                              ))}
                            </tbody>
                          </table></div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === 'history' && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-1">
                  {(['today', '7d', '30d'] as const).map(p => (
                    <button key={p} onClick={() => handleHistoryPeriod(p)} disabled={historyLoading} className={`px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-50 ${historyPeriod === p ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>{p === 'today' ? 'Hoje' : p === '7d' ? '7 dias' : '30 dias'}</button>
                  ))}
                </div>
                <select value={historyActorFilter} onChange={e => setHistoryActorFilter(e.target.value)} className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-orange-500/50">
                  <option value="ALL">Todos os responsáveis</option>
                  {[...new Set(localAuditLogs.map(l => l.actor.name))].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={historyActionFilter} onChange={e => setHistoryActionFilter(e.target.value)} className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-orange-500/50">
                  <option value="ALL">Todos os tipos</option>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {historyLoading && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Carregando...
                  </div>
                )}
                <p className="text-xs text-gray-500 ml-auto">
                  {localAuditLogs.filter(l => (historyActorFilter === 'ALL' || l.actor.name === historyActorFilter) && (historyActionFilter === 'ALL' || l.action === historyActionFilter)).length} evento{localAuditLogs.length !== 1 ? 's' : ''}
                </p>
              </div>
              {localAuditLogs.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-12 text-center text-gray-500">Nenhum evento para este período</div>
              ) : (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
                    <thead><tr className="border-b border-white/[0.06]">
                      <th className="px-5 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Horário</th>
                      <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Ação</th>
                      <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Responsável</th>
                      <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Motivo</th>
                      <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Antes</th>
                      <th className="px-4 py-3.5 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Depois</th>
                    </tr></thead>
                    <tbody>
                      {localAuditLogs.filter(l => (historyActorFilter === 'ALL' || l.actor.name === historyActorFilter) && (historyActionFilter === 'ALL' || l.action === historyActionFilter)).map(log => {
                        const cfg = ACTION_LABELS[log.action] ?? { label: log.action, color: 'text-gray-400' }
                        return (
                          <tr key={log.id} className="border-b border-white/[0.03] hover:bg-white/[0.015] transition-colors">
                            <td className="px-5 py-3.5 text-gray-500 text-xs font-mono hidden sm:table-cell">{formatDateTime(log.createdAt)}</td>
                            <td className="px-4 py-3.5"><span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span></td>
                            <td className="px-4 py-3.5"><div className="flex items-center gap-2"><span className="text-white text-xs">{log.actor.name}</span><RoleBadge role={log.actor.role} /></div></td>
                            <td className="px-4 py-3.5 text-xs text-gray-500 hidden sm:table-cell">{log.afterJson?.reason || '—'}</td>
                            <td className="px-4 py-3.5 hidden md:table-cell">{log.beforeJson?.status ? <StatusBadge status={log.beforeJson.status} /> : <span className="text-gray-600 text-xs">—</span>}</td>
                            <td className="px-4 py-3.5 hidden md:table-cell">{log.afterJson?.status ? <StatusBadge status={log.afterJson.status} /> : <span className="text-gray-600 text-xs">—</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table></div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <div className="mobile-nav-spacer" />
      <nav className="mobile-bottom-nav">
        {([
          { key: 'queue', icon: '⏳', label: 'Fila', badge: pendingGolden.length, alert: true },
          { key: 'all', icon: '📋', label: 'Fichas', badge: allGolden.length, alert: false },
          { key: 'users', icon: '👥', label: 'Usuários', badge: users.length, alert: false },
          { key: 'history', icon: '📜', label: 'Histórico', badge: auditLogs.length, alert: false },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors" style={{ color: tab === t.key ? '#F97316' : '#6B7280', minHeight: 56 }}>
            <div className="relative">
              <span className="text-lg leading-none">{t.icon}</span>
              {t.badge > 0 && <span className={`absolute -top-1 -right-2 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center leading-none ${t.alert && t.badge > 0 ? 'bg-red-500 text-white' : 'bg-orange-500 text-black'}`}>{t.badge > 9 ? '9+' : t.badge}</span>}
            </div>
            <span className="text-[10px] font-medium leading-none">{t.label}</span>
          </button>
        ))}
      </nav>

      {rejectModal && <RejectModal ids={rejectModal.ids} onConfirm={r => handleReject(rejectModal.ids, r)} onClose={() => setRejectModal(null)} />}
      {resetPwdModal && <ResetPwdModal userName={resetPwdModal.userName} onConfirm={p => handleResetPwd(resetPwdModal.userId, p)} onClose={() => setResetPwdModal(null)} />}
    </div>
  )
}
