# PLAN

## Goal

Build the HLTB Steam MVP from the approved spec and implementation plan.

## Current Strategy

Follow `docs/superpowers/plans/2026-05-23-hltb-steam.md` task-by-task, using focused checks during implementation and final automated verification before completion. The current git branch is `hltb-steam`, so implementation will proceed in this workspace rather than creating a nested `.worktrees/` directory that is outside `CONTROL.md`'s allowed file list.

## Phases

- [x] Phase 0: Inspect spec, plan, goal contract, control surface, and repo state.
- [ ] Phase 1: Scaffold Next.js, dependencies, Vitest, and shadcn/ui.
- [ ] Phase 2: Implement domain logic and tested server-side adapters.
- [ ] Phase 3: Implement auth, API routes, client hooks, and providers.
- [ ] Phase 4: Implement UI screens, table, filters, refresh controls, and error states.
- [ ] Phase 5: Write README and run final verification.

## Current Phase

Phase 1: Next.js scaffold and tooling setup.

## Open Decisions

- Manual smoke requires real `.env.local` credentials for Steam and NextAuth (`STEAM_API_KEY`, `NEXTAUTH_SECRET`). The cache is local (`.cache/`) and needs no credentials. If credentials are unavailable, automated verification still runs and the manual smoke gap must be reported.

## Resolved Decisions

- 2026-05-23: `GOAL.md` previously specified Upstash Redis in constraints, conflicting with the approved spec and plan (which use `unstorage` fs-driver in `.cache/`). `GOAL.md` has been edited to match the spec and plan; the cache is local and no third-party storage credentials are required.
