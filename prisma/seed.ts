import { PrismaClient, Role, DemandType, Cutoff, DemandStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'caramel-labs' },
    update: {},
    create: { name: 'Legacy', slug: 'caramel-labs' },
  })

  // Users
  const hash = (p: string) => bcrypt.hashSync(p, 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@caramellabs.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@caramellabs.com',
      passwordHash: hash('admin123'),
      role: Role.ADMIN,
      organizationId: org.id,
    },
  })

  const manager = await prisma.user.upsert({
    where: { email: 'gerente@caramellabs.com' },
    update: {},
    create: {
      name: 'Gerente',
      email: 'gerente@caramellabs.com',
      passwordHash: hash('gerente123'),
      role: Role.MANAGER,
      organizationId: org.id,
    },
  })

  const expert = await prisma.user.upsert({
    where: { email: 'marcus@caramellabs.com' },
    update: {},
    create: {
      name: 'Marcus',
      email: 'marcus@caramellabs.com',
      passwordHash: hash('marcus123'),
      role: Role.EXPERT,
      organizationId: org.id,
    },
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Demo demands
  const demands = [
    { type: DemandType.GOLDEN_TOKEN, playerId: '81688', playerName: 'Marcus', amountInCents: 300000, cutoff: Cutoff.CUT_12, status: DemandStatus.PENDING },
    { type: DemandType.GOLDEN_TOKEN, playerId: '72341', playerName: 'Carlos', amountInCents: 150000, cutoff: Cutoff.CUT_12, status: DemandStatus.COMPLETED },
    { type: DemandType.GOLDEN_TOKEN, playerId: '55892', playerName: 'Ana', amountInCents: 500000, cutoff: Cutoff.CUT_18, status: DemandStatus.PENDING },
    { type: DemandType.BASE_PLAYER, playerId: '10001', playerName: 'João Silva', amountInCents: null, cutoff: Cutoff.CUT_12, status: DemandStatus.PENDING },
    { type: DemandType.BASE_PLAYER, playerId: '10002', playerName: 'Maria Santos', amountInCents: null, cutoff: Cutoff.CUT_12, status: DemandStatus.COMPLETED },
    { type: DemandType.BASE_PLAYER, playerId: '10003', playerName: 'Pedro Costa', amountInCents: null, cutoff: Cutoff.CUT_18, status: DemandStatus.PENDING },
    { type: DemandType.BASE_PLAYER, playerId: '10004', playerName: 'Lucas Oliveira', amountInCents: null, cutoff: Cutoff.CUT_18, status: DemandStatus.PENDING },
  ]

  for (const d of demands) {
    await prisma.demand.upsert({
      where: {
        organizationId_type_playerId_playerName_operationalDate_cutoff: {
          organizationId: org.id,
          type: d.type,
          playerId: d.playerId ?? '',
          playerName: d.playerName,
          operationalDate: today,
          cutoff: d.cutoff,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        createdById: expert.id,
        completedById: d.status === DemandStatus.COMPLETED ? manager.id : null,
        completedAt: d.status === DemandStatus.COMPLETED ? new Date() : null,
        operationalDate: today,
        ...d,
      },
    })
  }

  console.log('✅ Seed complete!')
  console.log('   admin@caramellabs.com / admin123')
  console.log('   gerente@caramellabs.com / gerente123')
  console.log('   marcus@caramellabs.com / marcus123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
