import { z } from 'zod'

const schema = z.object({
  STEAM_API_KEY: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
})

export const env = schema.parse(process.env)
