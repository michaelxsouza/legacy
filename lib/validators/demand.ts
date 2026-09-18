import { z } from 'zod'

export const goldenTokenSchema = z.object({
  playerId: z.string().optional(),
  playerName: z.string().min(1, 'Nome do jogador obrigatório'),
  amount: z.string().min(1, 'Valor obrigatório'),
  cutoff: z.enum(['CUT_12', 'CUT_18']),
  operationalDate: z.string(),
})

export const basePlayerSchema = z.object({
  playersRaw: z.string().min(1, 'Insira pelo menos um jogador'),
  cutoff: z.enum(['CUT_12', 'CUT_18']),
  operationalDate: z.string(),
})

export type GoldenTokenInput = z.infer<typeof goldenTokenSchema>
export type BasePlayerInput = z.infer<typeof basePlayerSchema>
