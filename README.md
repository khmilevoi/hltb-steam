# HLTB x Steam

A local Next.js app that signs you in through Steam, fetches your Steam library,
enriches it with HowLongToBeat estimates, and lets you search, sort, and filter
by playtime.

## Stack

- Next.js 16 App Router + TypeScript
- Auth.js v5 + Steam OpenID via `next-auth-steam`
- `unstorage` fs-driver local cache in `.cache/`
- TanStack Query v5 + TanStack Table v8
- shadcn/ui + Tailwind CSS
- `errore` errors-as-values outside TanStack Query fetch boundaries
- Vitest unit tests

## Setup

```bash
cp .env.local.example .env.local
pnpm install
pnpm dev
```

Fill `.env.local` before using Steam sign-in:

```bash
STEAM_API_KEY=       # https://steamcommunity.com/dev/apikey
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=    # openssl rand -base64 32
```

Your Steam profile and Game details privacy setting must be public for the
library endpoint to return games.

The server cache is stored in `.cache/` and is created automatically. Delete
`.cache/` to wipe cached Steam library and HLTB results.

## Scripts

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm lint
```

## Verification

```bash
pnpm test
pnpm tsc --noEmit
pnpm build
```

Manual smoke with real credentials:

1. Open `http://localhost:3000`.
2. Sign in through Steam.
3. Open the library page and confirm the table populates.
4. Confirm HLTB columns fill in, search filters live, sorting changes order,
   range filtering applies, and refresh buttons disable briefly after click.

See `docs/superpowers/specs/2026-05-23-hltb-steam-design.md` for the full MVP
spec.
