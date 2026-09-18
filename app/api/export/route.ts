import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { formatBRL, formatDateTime } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const user = session.user as any
  const dateStr = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const operationalDate = new Date(dateStr + 'T00:00:00.000Z')

  const demands = await prisma.demand.findMany({
    where: { organizationId: user.organizationId, operationalDate },
    include: { createdBy: { select: { name: true } }, completedBy: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const headers = ['ID Jogador', 'Nome', 'Tipo', 'Valor (R$)', 'Data', 'Corte', 'Status', 'Criado por', 'Concluído por', 'Criado em', 'Concluído em']
  const rows = demands.map(d => [
    d.playerId || '',
    d.playerName,
    d.type === 'GOLDEN_TOKEN' ? 'Ficha Dourada' : 'Jogador na Base',
    d.amountInCents ? formatBRL(d.amountInCents) : '',
    new Date(d.operationalDate).toLocaleDateString('pt-BR'),
    d.cutoff === 'CUT_12' ? '12:00' : '18:00',
    d.status === 'PENDING' ? 'Pendente' : d.status === 'COMPLETED' ? 'Concluído' : 'Cancelado',
    d.createdBy.name,
    d.completedBy?.name || '',
    formatDateTime(d.createdAt),
    d.completedAt ? formatDateTime(d.completedAt) : '',
  ])

  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const bom = '﻿'

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="legacy-${dateStr}.csv"`,
    },
  })
}
