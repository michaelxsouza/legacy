'use client'

import { useState, useTransition } from 'react'
import { formatBRL, formatDateTime } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { createGoldenToken, createBasePlayers, completeDemand } from '@/lib/actions/demands'

type Demand = {
  id: string
  type: string
  playerId: string | null
  playerName: string
  amountInCents: number | null
  cutoff: string
  status: string
  createdAt: Date
  completedAt: Date | null
  createdBy: { name: string }
  completedBy: { name: string } | null
}

type Props = {
  dateStr: string
  metrics: { goldenTotal: number; goldenValueCents: number; baseTotal: number }
  cut12Golden: Demand[]
  cut12Base: Demand[]
  cut18Golden: Demand[]
  cut18Base: Demand[]
  userRole: string
  userName: string
  organizationName: string
}

const S = {
  page: { padding: '24px', maxWidth: '1400px', margin: '0 auto' } as React.CSSProperties,
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '16px', marginBottom: '24px' },
  title: { fontSize: '28px', fontWeight: 800, color: '#F5F5F5', letterSpacing: '-0.02em' },
  subtitle: { color: '#A3A3A3', fontSize: '14px', marginTop: '4px' },
  affilBadge: { display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#1A0D00', border: '1px solid #7C3A0E', borderRadius: '6px', padding: '4px 12px', color: '#F97316', fontSize: '12px', fontWeight: 600 },
  dateRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  dateBtn: { background: '#141414', border: '1px solid #262626', color: '#F5F5F5', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' },
  dateBtnOrange: { background: '#F97316', border: 'none', color: '#000', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 },
  dateInput: { background: '#141414', border: '1px solid #262626', color: '#F5F5F5', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', colorScheme: 'dark' as const },
  metricsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' },
  metricCard: { background: '#141414', border: '1px solid #262626', borderRadius: '12px', padding: '20px' },
  metricLabel: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#525252', marginBottom: '10px' },
  metricValue: { fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '16px' },
  cutoffPanel: { background: '#141414', border: '1px solid #262626', borderRadius: '12px', padding: '20px' },
  cutoffTitle: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' },
  cutoffTitleText: { fontSize: '18px', fontWeight: 700, color: '#F5F5F5' },
  cutoffBadge: { background: '#1C1C1C', border: '1px solid #333', borderRadius: '6px', padding: '2px 10px', fontSize: '12px', color: '#A3A3A3', fontWeight: 500 },
  section: { background: '#0A0A0A', border: '1px solid #1C1C1C', borderRadius: '10px', padding: '16px', marginBottom: '12px' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: '#F5F5F5' },
  sectionDot: (color: string) => ({ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }),
  sectionMeta: { fontSize: '12px', color: '#525252' },
  formRow: { display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' as const },
  input: { flex: 1, minWidth: '100px', background: '#141414', border: '1px solid #262626', color: '#F5F5F5', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none' },
  textarea: { width: '100%', background: '#141414', border: '1px solid #262626', color: '#F5F5F5', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', resize: 'vertical' as const, minHeight: '72px' },
  btnOrange: { background: '#F97316', border: 'none', color: '#000', fontWeight: 700, fontSize: '13px', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnGreen: { background: '#052010', border: '1px solid #0a3a1a', color: '#22C55E', fontWeight: 700, fontSize: '13px', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnSmall: { background: '#1A0D00', border: '1px solid #7C3A0E', color: '#F97316', fontWeight: 600, fontSize: '11px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' },
  btnSmallGreen: { background: '#052010', border: '1px solid #0a3a1a', color: '#22C55E', fontWeight: 600, fontSize: '11px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' },
  emptyText: { color: '#525252', fontSize: '13px', padding: '8px 0' },
  toastOk: { position: 'fixed' as const, bottom: '24px', right: '24px', background: '#052010', border: '1px solid #0a3a1a', color: '#22C55E', borderRadius: '10px', padding: '12px 20px', fontSize: '14px', fontWeight: 600, zIndex: 9999 },
  toastErr: { position: 'fixed' as const, bottom: '24px', right: '24px', background: '#1a0505', border: '1px solid #3a0a0a', color: '#ef4444', borderRadius: '10px', padding: '12px 20px', fontSize: '14px', fontWeight: 600, zIndex: 9999 },
  demandRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', padding: '8px 0', borderBottom: '1px solid #1C1C1C' },
  demandInfo: { flex: 1, minWidth: 0 },
  demandName: { fontSize: '13px', fontWeight: 600, color: '#F5F5F5' },
  demandMeta: { fontSize: '11px', color: '#525252', marginTop: '2px' },
}

function Toast({ msg, type, onClose }: { msg: string; type: 'ok' | 'err'; onClose: () => void }) {
  return (
    <div style={type === 'ok' ? S.toastOk : S.toastErr} onClick={onClose}>
      {type === 'ok' ? '✓' : '✕'} {msg}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'badge-pending',
    COMPLETED: 'badge-completed',
    CANCELLED: 'badge-cancelled',
  }
  const label: Record<string, string> = {
    PENDING: 'Pendente',
    COMPLETED: 'Concluído',
    CANCELLED: 'Cancelado',
  }
  return <span className={map[status] || 'badge-pending'}>{label[status] || status}</span>
}

function DemandItem({ d, canComplete, onComplete, isPending, }: {
  d: Demand; canComplete: boolean; onComplete: (id: string) => void;
  isPending: boolean
}) {
  return (
    <div style={S.demandRow}>
      <div style={S.demandInfo}>
        <div style={S.demandName}>
          {d.playerId && <span style={{ color: '#F97316', marginRight: '6px', fontSize: '12px' }}>#{d.playerId}</span>}
          {d.playerName}
          {d.amountInCents && <span style={{ color: '#A3A3A3', marginLeft: '8px', fontSize: '12px' }}>{formatBRL(d.amountInCents)}</span>}
        </div>
        <div style={S.demandMeta}>
          por {d.createdBy.name} · {new Date(d.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {d.completedBy && ` · concluído por ${d.completedBy.name}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <StatusBadge status={d.status} />
        {canComplete && d.status === 'PENDING' && (
          <button style={S.btnSmallGreen} disabled={isPending} onClick={() => onComplete(d.id)}>
            {isPending ? '...' : '✓ Concluir'}
          </button>
        )}
      </div>
    </div>
  )
}

export function DashboardClient({
  dateStr, metrics, cut12Golden, cut12Base, cut18Golden, cut18Base,
  userRole, userName, organizationName,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  // Form states
  const [gt12Id, setGt12Id] = useState('')
  const [gt12Name, setGt12Name] = useState('')
  const [gt12Amount, setGt12Amount] = useState('')
  const [gt18Id, setGt18Id] = useState('')
  const [gt18Name, setGt18Name] = useState('')
  const [gt18Amount, setGt18Amount] = useState('')
  const [bp12Raw, setBp12Raw] = useState('')
  const [bp18Raw, setBp18Raw] = useState('')

  const canComplete = userRole === 'MANAGER' || userRole === 'ADMIN'

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function changeDate(delta: number) {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setDate(d.getDate() + delta)
    router.push(`/dashboard?date=${d.toISOString().slice(0, 10)}`)
  }

  async function handleGoldenToken(cutoff: 'CUT_12' | 'CUT_18') {
    const fd = new FormData()
    fd.append('playerId', cutoff === 'CUT_12' ? gt12Id : gt18Id)
    fd.append('playerName', cutoff === 'CUT_12' ? gt12Name : gt18Name)
    fd.append('amount', cutoff === 'CUT_12' ? gt12Amount : gt18Amount)
    fd.append('cutoff', cutoff)
    fd.append('operationalDate', dateStr)
    startTransition(async () => {
      const res = await createGoldenToken(fd)
      if (res?.error) { showToast(res.error, 'err'); return }
      showToast('Ficha Dourada adicionada!', 'ok')
      if (cutoff === 'CUT_12') { setGt12Id(''); setGt12Name(''); setGt12Amount('') }
      else { setGt18Id(''); setGt18Name(''); setGt18Amount('') }
    })
  }

  async function handleBasePlayers(cutoff: 'CUT_12' | 'CUT_18') {
    const fd = new FormData()
    fd.append('playersRaw', cutoff === 'CUT_12' ? bp12Raw : bp18Raw)
    fd.append('cutoff', cutoff)
    fd.append('operationalDate', dateStr)
    startTransition(async () => {
      const res = await createBasePlayers(fd)
      if (res?.error) { showToast(res.error, 'err'); return }
      const r = res as any
      const msg = `${r.added?.length || 0} jogador(es) adicionado(s)${r.skipped?.length ? `, ${r.skipped.length} ignorado(s)` : ''}`
      showToast(msg, 'ok')
      if (cutoff === 'CUT_12') setBp12Raw(''); else setBp18Raw('')
    })
  }

  async function handleComplete(id: string) {
    startTransition(async () => {
      const res = await completeDemand(id)
      if (res?.error) showToast(res.error, 'err')
      else showToast('Marcado como concluído', 'ok')
    })
  }

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const displayDate = new Date(dateStr + 'T00:00:00Z').toLocaleDateString('pt-BR')
  const isToday = dateStr === todayStr

  function CutoffPanel({ cutoff, goldenDemands, baseDemands }: { cutoff: 'CUT_12' | 'CUT_18'; goldenDemands: Demand[]; baseDemands: Demand[] }) {
    const label = cutoff === 'CUT_12' ? '12:00' : '18:00'
    const gtId = cutoff === 'CUT_12' ? gt12Id : gt18Id
    const gtName = cutoff === 'CUT_12' ? gt12Name : gt18Name
    const gtAmount = cutoff === 'CUT_12' ? gt12Amount : gt18Amount
    const setGtId = cutoff === 'CUT_12' ? setGt12Id : setGt18Id
    const setGtName = cutoff === 'CUT_12' ? setGt12Name : setGt18Name
    const setGtAmount = cutoff === 'CUT_12' ? setGt12Amount : setGt18Amount
    const bpRaw = cutoff === 'CUT_12' ? bp12Raw : bp18Raw
    const setBpRaw = cutoff === 'CUT_12' ? setBp12Raw : setBp18Raw

    const gPending = goldenDemands.filter(d => d.status === 'PENDING').length
    const bPending = baseDemands.filter(d => d.status === 'PENDING').length

    return (
      <div style={S.cutoffPanel}>
        <div style={S.cutoffTitle}>
          <span style={S.cutoffTitleText}>Corte das {label}</span>
          <span style={S.cutoffBadge}>{label}</span>
        </div>

        {/* Fichas Douradas */}
        <div style={S.section}>
          <div style={S.sectionHeader}>
            <div style={S.sectionTitle}>
              <div style={S.sectionDot('#F97316')} />
              Fichas Douradas
            </div>
            <span style={S.sectionMeta}>
              {goldenDemands.length} hoje · {goldenDemands.reduce((s, d) => s + (d.amountInCents || 0), 0) > 0 ? formatBRL(goldenDemands.reduce((s, d) => s + (d.amountInCents || 0), 0)) : '0'} · {gPending} pendente(s)
            </span>
          </div>
          <div style={S.formRow}>
            <input style={{ ...S.input, maxWidth: '100px' }} placeholder="ID" value={gtId} onChange={e => setGtId(e.target.value)} />
            <input style={{ ...S.input, flex: 2 }} placeholder="Nome do jogador" value={gtName} onChange={e => setGtName(e.target.value)} />
            <input style={{ ...S.input, maxWidth: '110px' }} placeholder="Valor (R$)" value={gtAmount} onChange={e => setGtAmount(e.target.value)} />
            <button style={S.btnOrange} disabled={isPending} onClick={() => handleGoldenToken(cutoff)}>
              Adicionar
            </button>
          </div>
          {goldenDemands.length === 0 ? (
            <p style={S.emptyText}>Nada adicionado ainda.</p>
          ) : (
            goldenDemands.map(d => (
              <DemandItem key={d.id} d={d} canComplete={canComplete} onComplete={handleComplete}
                isPending={isPending} />
            ))
          )}
        </div>

        {/* Jogadores na Base */}
        <div style={S.section}>
          <div style={S.sectionHeader}>
            <div style={S.sectionTitle}>
              <div style={S.sectionDot('#22C55E')} />
              Jogador na Base
            </div>
            <span style={S.sectionMeta}>{baseDemands.length} hoje · {bPending} pendente(s)</span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <textarea
              style={S.textarea}
              placeholder={'ID ou Nome (vários? separe por vírgula ou quebra de linha)\nEx: 81688 — Marcus\nJoão, Maria, Pedro'}
              value={bpRaw}
              onChange={e => setBpRaw(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button style={S.btnGreen} disabled={isPending} onClick={() => handleBasePlayers(cutoff)}>
              Adicionar
            </button>
          </div>
          {baseDemands.length === 0 ? (
            <p style={S.emptyText}>Nada adicionado ainda.</p>
          ) : (
            baseDemands.map(d => (
              <DemandItem key={d.id} d={d} canComplete={canComplete} onComplete={handleComplete}
                isPending={isPending} />
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Top row */}
      <div style={S.topRow}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <h1 style={S.title}>Legacy</h1>
            <span style={S.affilBadge}>
              {userName} · {organizationName}
            </span>
          </div>
          <p style={S.subtitle}>Contagem diária — cortes das 12:00 e 18:00</p>
        </div>
        <div style={S.dateRow}>
          <button style={S.dateBtn} onClick={() => changeDate(-1)}>‹</button>
          <input
            type="date" value={dateStr}
            onChange={e => router.push(`/dashboard?date=${e.target.value}`)}
            style={S.dateInput}
          />
          <button style={S.dateBtn} onClick={() => changeDate(1)}>›</button>
          <button style={isToday ? S.dateBtnOrange : S.dateBtn} onClick={() => router.push('/dashboard')}>
            Hoje
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div style={S.metricsRow}>
        <div style={S.metricCard}>
          <div style={S.metricLabel}>Fichas Douradas — Jogadores Hoje</div>
          <div style={{ ...S.metricValue, color: '#F97316' }}>{metrics.goldenTotal}</div>
        </div>
        <div style={S.metricCard}>
          <div style={S.metricLabel}>Fichas Douradas — Valor Total Hoje</div>
          <div style={{ ...S.metricValue, color: '#F97316' }}>
            {metrics.goldenValueCents > 0 ? formatBRL(metrics.goldenValueCents) : 'R$ 0,00'}
          </div>
        </div>
        <div style={S.metricCard}>
          <div style={S.metricLabel}>Jogadores na Base — Total do Dia</div>
          <div style={{ ...S.metricValue, color: '#22C55E' }}>{metrics.baseTotal}</div>
        </div>
      </div>

      {/* Cutoff panels */}
      <div style={S.grid2}>
        <CutoffPanel cutoff="CUT_12" goldenDemands={cut12Golden} baseDemands={cut12Base} />
        <CutoffPanel cutoff="CUT_18" goldenDemands={cut18Golden} baseDemands={cut18Base} />
      </div>
    </div>
  )
}
