import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { authConfig } from './auth.config'
import { z } from 'zod'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = z.object({
          email: z.string().email(),
          password: z.string().min(1),
        }).safeParse(credentials)

        if (!parsed.success) return null

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { organization: true },
        })

        if (!user || !user.active) return null
        if (!bcrypt.compareSync(parsed.data.password, user.passwordHash)) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
        } as any
      },
    }),
  ],
})

export type SessionUser = {
  id: string
  name: string
  email: string
  role: 'EXPERT' | 'MANAGER' | 'ADMIN'
  organizationId: string
  organizationName: string
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user) return null
  return session.user as unknown as SessionUser
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new Error('Não autenticado')
  return user
}

export async function requireRole(roles: ('EXPERT' | 'MANAGER' | 'ADMIN')[]): Promise<SessionUser> {
  const user = await requireAuth()
  if (!roles.includes(user.role)) throw new Error('Sem permissão')
  return user
}
