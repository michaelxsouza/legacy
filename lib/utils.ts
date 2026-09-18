import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('pt-BR')
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function parseBRL(value: string): number {
  const clean = value.replace(/[R$\s.]/g, '').replace(',', '.')
  const num = parseFloat(clean)
  if (isNaN(num) || num <= 0) return 0
  return Math.round(num * 100)
}

export function getTodayLocal(): Date {
  const now = new Date()
  const sp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  return new Date(sp + 'T00:00:00.000Z')
}
