'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/auth'
import { parseBRL } from '@/lib/utils'
import { DemandType, Cutoff, DemandStatus } from '@prisma/client'
import { goldenTokenSchema, basePlayerSchema } from '@/lib/validators/demand'

function parseOperationalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00.000Z')
}

export async function createGoldenToken(formData: FormData) {
  const user = await requireAuth()

  const parsed = goldenTokenSchema.safeParse({
    playerId: formData.get('playerId') || undefined,
    playerName: formData.get('playerName'),
    amount: formData.get('amount'),
    cutoff: formData.get('cutoff'),
    operationalDate: formData.get('operationalDate'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

  const { playerId, playerName, amount, cutoff: cutoffStr, operationalDate: dateStr } = parsed.data
  const cutoff = cutoffStr === 'CUT_12' ? Cutoff.CUT_12 : Cutoff.CUT_18
  const operationalDate = parseOperationalDate(dateStr)
  const amountInCents = parseBRL(amount)
  if (!amountInCents) return { error: 'Valor inválido' }

  const existing = await prisma.demand.findFirst({
    where: { organizationId: user.organizationId, type: DemandType.GOLDEN_TOKEN, playerName, playerId: playerId || null, operationalDate, cutoff },
  })
  if (existing) return { error: `Ficha Dourada para "${playerName}" já cadastrada neste corte` }

  await prisma.$transaction(async (tx) => {
    const demand = await tx.demand.create({
      data: { organizationId: user.organizationId, createdById: user.id, type: DemandType.GOLDEN_TOKEN, playerId: playerId || null, playerName, amountInCents, operationalDate, cutoff, status: DemandStatus.PENDING },
    })
    await tx.auditLog.create({
      data: { organizationId: user.organizationId, actorId: user.id, entityType: 'Demand', entityId: demand.id, action: 'CREATE', afterJson: { type: 'GOLDEN_TOKEN', playerName, amountInCents } },
    })
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export async function createBasePlayers(formData: FormData) {
  const user = await requireAuth()

  const parsed = basePlayerSchema.safeParse({
    playersRaw: formData.get('playersRaw'),
    cutoff: formData.get('cutoff'),
    operationalDate: formData.get('operationalDate'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

  const { playersRaw: raw, cutoff: cutoffStr, operationalDate: dateStr } = parsed.data
  const cutoff = cutoffStr === 'CUT_12' ? Cutoff.CUT_12 : Cutoff.CUT_18
  const operationalDate = parseOperationalDate(dateStr)

  const lines = raw.split(/[,\n]+/).map(l => l.trim()).filter(Boolean)
  const unique = [...new Set(lines)]
  const results = { added: [] as string[], skipped: [] as string[] }

  // Parse all players first
  type PlayerEntry = { playerId?: string; playerName: string }
  const players: PlayerEntry[] = unique.map(line => {
    const dashMatch = line.match(/^(\d+)\s*[—\-]\s*(.+)$/)
    if (dashMatch) return { playerId: dashMatch[1], playerName: dashMatch[2].trim() }
    if (/^\d+$/.test(line)) return { playerId: line, playerName: line }
    return { playerName: line }
  })

  // Batch check existing in one query
  const existing = await prisma.demand.findMany({
    where: { organizationId: user.organizationId, type: DemandType.BASE_PLAYER, operationalDate, cutoff, playerName: { in: players.map(p => p.playerName) } },
    select: { playerName: true },
  })
  const existingNames = new Set(existing.map(e => e.playerName))

  const toCreate = players.filter(p => {
    if (existingNames.has(p.playerName)) { results.skipped.push(p.playerName); return false }
    return true
  })

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      const created = await tx.demand.createManyAndReturn({
        data: toCreate.map(p => ({ organizationId: user.organizationId, createdById: user.id, type: DemandType.BASE_PLAYER, playerId: p.playerId || null, playerName: p.playerName, operationalDate, cutoff, status: DemandStatus.PENDING })),
        skipDuplicates: true,
      })
      await tx.auditLog.createMany({
        data: created.map(d => ({ organizationId: user.organizationId, actorId: user.id, entityType: 'Demand', entityId: d.id, action: 'CREATE', afterJson: { type: 'BASE_PLAYER', playerName: d.playerName } })),
      })
      results.added.push(...created.map(d => d.playerName))
    })
  }

  revalidatePath('/dashboard')
  if (results.added.length === 0) return { error: 'Todos já cadastrados neste corte' }
  return { success: true, added: results.added, skipped: results.skipped }
}

export async function approveDemands(demandIds: string[]) {
  const user = await requireRole(['ADMIN', 'MANAGER'])
  if (!demandIds.length) return { error: 'Selecione ao menos uma solicitação' }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.demand.updateMany({
      where: { id: { in: demandIds }, organizationId: user.organizationId, status: DemandStatus.PENDING },
      data: { status: DemandStatus.APPROVED, approvedById: user.id, approvedAt: now },
    })
    await tx.auditLog.createMany({
      data: demandIds.map(id => ({ organizationId: user.organizationId, actorId: user.id, entityType: 'Demand', entityId: id, action: 'APPROVE', beforeJson: { status: 'PENDING' }, afterJson: { status: 'APPROVED' } })),
    })
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export async function rejectDemands(demandIds: string[], reason?: string) {
  const user = await requireRole(['ADMIN', 'MANAGER'])
  if (!demandIds.length) return { error: 'Selecione ao menos uma solicitação' }

  await prisma.$transaction(async (tx) => {
    await tx.demand.updateMany({
      where: { id: { in: demandIds }, organizationId: user.organizationId, status: DemandStatus.PENDING },
      data: { status: DemandStatus.CANCELLED, cancelledById: user.id, cancelledAt: new Date(), ...(reason ? { notes: reason } : {}) },
    })
    await tx.auditLog.createMany({
      data: demandIds.map(id => ({ organizationId: user.organizationId, actorId: user.id, entityType: 'Demand', entityId: id, action: 'REJECT', beforeJson: { status: 'PENDING' }, afterJson: { status: 'CANCELLED', reason: reason || null } })),
    })
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export async function completeDemand(demandId: string) {
  const user = await requireRole(['MANAGER', 'ADMIN'])

  const demand = await prisma.demand.findUnique({ where: { id: demandId } })
  if (!demand) return { error: 'Não encontrada' }
  if (demand.organizationId !== user.organizationId) return { error: 'Sem permissão' }
  if (demand.status !== DemandStatus.APPROVED) return { error: 'Solicitação precisa estar aprovada' }

  await prisma.$transaction(async (tx) => {
    await tx.demand.update({
      where: { id: demandId },
      data: { status: DemandStatus.COMPLETED, completedById: user.id, completedAt: new Date() },
    })
    await tx.auditLog.create({
      data: { organizationId: user.organizationId, actorId: user.id, entityType: 'Demand', entityId: demandId, action: 'COMPLETE', beforeJson: { status: 'APPROVED' }, afterJson: { status: 'COMPLETED' } },
    })
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export async function cancelDemand(demandId: string) {
  const user = await requireRole(['ADMIN'])

  const demand = await prisma.demand.findUnique({ where: { id: demandId } })
  if (!demand || demand.organizationId !== user.organizationId) return { error: 'Não encontrada' }

  await prisma.$transaction(async (tx) => {
    await tx.demand.update({
      where: { id: demandId },
      data: { status: DemandStatus.CANCELLED, cancelledById: user.id, cancelledAt: new Date() },
    })
    await tx.auditLog.create({
      data: { organizationId: user.organizationId, actorId: user.id, entityType: 'Demand', entityId: demandId, action: 'CANCEL', beforeJson: { status: demand.status }, afterJson: { status: 'CANCELLED' } },
    })
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export async function getDashboardData(dateStr: string) {
  const user = await requireAuth()
  const operationalDate = parseOperationalDate(dateStr)

  const where = user.role === 'EXPERT'
    ? { organizationId: user.organizationId, operationalDate, createdById: user.id }
    : { organizationId: user.organizationId, operationalDate }

  const demands = await prisma.demand.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      completedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const demandsWithApproved = demands
  const golden = demands.filter(d => d.type === 'GOLDEN_TOKEN')
  const metrics = {
    goldenTotal: golden.length,
    goldenPending: golden.filter(d => d.status === 'PENDING').length,
    goldenApproved: golden.filter(d => d.status === 'APPROVED').length,
    goldenCompleted: golden.filter(d => d.status === 'COMPLETED').length,
    goldenValueCents: golden.filter(d => d.status === 'APPROVED' || d.status === 'COMPLETED').reduce((s, d) => s + (d.amountInCents || 0), 0),
    baseTotal: demands.filter(d => d.type === 'BASE_PLAYER').length,
  }

  return { demands: demandsWithApproved, metrics, userRole: user.role, userId: user.id }
}

export async function getPendingCount() {
  const user = await requireAuth()
  if (user.role !== 'ADMIN') return 0
  return prisma.demand.count({
    where: { organizationId: user.organizationId, status: DemandStatus.PENDING, type: DemandType.GOLDEN_TOKEN },
  })
}

export async function getAuditLogsForDate(dateStr: string) {
  const user = await requireRole(['ADMIN'])
  const operationalDate = parseOperationalDate(dateStr)

  const demandIds = await prisma.demand.findMany({
    where: { organizationId: user.organizationId, operationalDate },
    select: { id: true },
  })
  if (demandIds.length === 0) return []

  return prisma.auditLog.findMany({
    where: { organizationId: user.organizationId, entityId: { in: demandIds.map(d => d.id) } },
    include: { actor: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getWeeklyStats(dateStr: string) {
  const user = await requireRole(['ADMIN'])
  const end = parseOperationalDate(dateStr)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)

  // 2 queries instead of 21
  const [countRows, valueRows] = await Promise.all([
    prisma.$queryRawUnsafe<{ date: Date; type: string; count: bigint }[]>(
      `SELECT "operationalDate" as date, type::text, COUNT(*) as count
       FROM "Demand"
       WHERE "organizationId" = $1
         AND "operationalDate" >= $2 AND "operationalDate" <= $3
         AND type IN ('GOLDEN_TOKEN'::"DemandType", 'BASE_PLAYER'::"DemandType")
       GROUP BY "operationalDate", type`,
      user.organizationId, start, end
    ),
    prisma.$queryRawUnsafe<{ date: Date; total: bigint }[]>(
      `SELECT "operationalDate" as date, COALESCE(SUM("amountInCents"), 0) as total
       FROM "Demand"
       WHERE "organizationId" = $1
         AND "operationalDate" >= $2 AND "operationalDate" <= $3
         AND type = 'GOLDEN_TOKEN'::"DemandType"
         AND status != 'CANCELLED'::"DemandStatus"
       GROUP BY "operationalDate"`,
      user.organizationId, start, end
    ),
  ])

  // Build lookup maps
  const countMap: Record<string, { golden: number; base: number }> = {}
  for (const r of countRows) {
    const key = new Date(r.date).toISOString().slice(0, 10)
    if (!countMap[key]) countMap[key] = { golden: 0, base: 0 }
    if (r.type === 'GOLDEN_TOKEN') countMap[key].golden = Number(r.count)
    else countMap[key].base = Number(r.count)
  }
  const valueMap: Record<string, number> = {}
  for (const r of valueRows) {
    valueMap[new Date(r.date).toISOString().slice(0, 10)] = Number(r.total)
  }

  // Build 7-day array
  const results = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    results.push({
      date: key,
      label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      golden: countMap[key]?.golden ?? 0,
      base: countMap[key]?.base ?? 0,
      valueCents: valueMap[key] ?? 0,
    })
  }
  return results
}

export async function getAuditLogs(startDate: string, endDate: string) {
  const user = await requireRole(['ADMIN'])
  const start = parseOperationalDate(startDate)
  const end = parseOperationalDate(endDate)
  const nextDay = new Date(end)
  nextDay.setDate(nextDay.getDate() + 1)

  const demandIds = await prisma.demand.findMany({
    where: { organizationId: user.organizationId, operationalDate: { gte: start, lt: nextDay } },
    select: { id: true },
  })
  if (demandIds.length === 0) return []

  return prisma.auditLog.findMany({
    where: { organizationId: user.organizationId, entityId: { in: demandIds.map(d => d.id) } },
    include: { actor: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
}

export async function getExpertStats(dateStr: string) {
  const user = await requireRole(['ADMIN'])
  const end = parseOperationalDate(dateStr)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)

  const demands = await prisma.demand.findMany({
    where: { organizationId: user.organizationId, type: DemandType.GOLDEN_TOKEN, operationalDate: { gte: start, lte: end } },
    select: { createdById: true, status: true, amountInCents: true },
  })

  const stats: Record<string, { total: number; approved: number; completed: number; valueCents: number }> = {}
  for (const d of demands) {
    if (!stats[d.createdById]) stats[d.createdById] = { total: 0, approved: 0, completed: 0, valueCents: 0 }
    stats[d.createdById].total++
    if (d.status === 'APPROVED') stats[d.createdById].approved++
    if (d.status === 'COMPLETED') stats[d.createdById].completed++
    if (d.status === 'APPROVED' || d.status === 'COMPLETED') stats[d.createdById].valueCents += d.amountInCents || 0
  }
  return stats
}
