'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/auth'
import bcrypt from 'bcryptjs'

export async function listUsers() {
  const admin = await requireRole(['ADMIN', 'MANAGER'])
  return prisma.user.findMany({
    where: { organizationId: admin.organizationId },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })
}

export async function createUser(formData: FormData) {
  const admin = await requireRole(['ADMIN'])

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.toLowerCase().trim()
  const password = formData.get('password') as string
  const role = formData.get('role') as string

  if (!name || !email || !password) return { error: 'Todos os campos são obrigatórios' }
  if (!['EXPERT', 'MANAGER', 'ADMIN'].includes(role)) return { error: 'Cargo inválido' }
  if (password.length < 6) return { error: 'Senha deve ter ao menos 6 caracteres' }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: 'E-mail já cadastrado' }

  const passwordHash = bcrypt.hashSync(password, 10)
  await prisma.user.create({
    data: { name, email, passwordHash, role: role as any, organizationId: admin.organizationId },
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export async function toggleUserActive(userId: string) {
  const admin = await requireRole(['ADMIN'])

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.organizationId !== admin.organizationId) return { error: 'Usuário não encontrado' }
  if (user.id === admin.id) return { error: 'Você não pode desativar sua própria conta' }

  await prisma.user.update({ where: { id: userId }, data: { active: !user.active } })
  revalidatePath('/dashboard')
  return { success: true }
}

export async function resetUserPassword(userId: string, newPassword: string) {
  const admin = await requireRole(['ADMIN'])
  if (newPassword.length < 6) return { error: 'Senha deve ter ao menos 6 caracteres' }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.organizationId !== admin.organizationId) return { error: 'Usuário não encontrado' }

  const passwordHash = bcrypt.hashSync(newPassword, 10)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  return { success: true }
}
