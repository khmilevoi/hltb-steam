// Provide placeholder env vars so lib/env.ts parses cleanly during tests.
// Real values come from .env.local in dev; tests never hit real Steam.
process.env.STEAM_API_KEY = process.env.STEAM_API_KEY ?? 'test_key'
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'test_secret'
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
