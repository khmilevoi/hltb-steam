# PLAN

## Goal

Build the HLTB Steam MVP from the approved spec and implementation plan.

## Current Strategy

Follow `docs/superpowers/plans/2026-05-23-hltb-steam.md` task-by-task, using focused checks during implementation and final automated verification before completion.

## Phases

- [ ] Phase 0: Inspect spec, plan, goal contract, control surface, and repo state.
- [ ] Phase 1: Scaffold Next.js, dependencies, Vitest, and shadcn/ui.
- [ ] Phase 2: Implement domain logic and tested server-side adapters.
- [ ] Phase 3: Implement auth, API routes, client hooks, and providers.
- [ ] Phase 4: Implement UI screens, table, filters, refresh controls, and error states.
- [ ] Phase 5: Write README and run final verification.

## Current Phase

Phase 0.

## Open Decisions

- Manual smoke requires real `.env.local` credentials for Steam, NextAuth, and Upstash. If unavailable, automated verification still runs and the manual smoke gap must be reported.

