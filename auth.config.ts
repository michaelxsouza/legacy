import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnLoginPage = nextUrl.pathname.startsWith('/login')
      if (isOnLoginPage) return isLoggedIn ? Response.redirect(new URL('/dashboard', nextUrl)) : true
      if (!isLoggedIn) return false
      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.organizationId = (user as any).organizationId
        token.organizationName = (user as any).organizationName
      }
      return token
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        ;(session.user as any).role = token.role
        ;(session.user as any).organizationId = token.organizationId
        ;(session.user as any).organizationName = token.organizationName
      }
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
