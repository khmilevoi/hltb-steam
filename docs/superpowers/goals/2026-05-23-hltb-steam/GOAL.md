<goal>
Build the HLTB Steam MVP described by `docs/superpowers/specs/2026-05-23-hltb-steam-design.md` and implemented through `docs/superpowers/plans/2026-05-23-hltb-steam.md`: a local Next.js 16 app where a user signs in through Steam OpenID, loads their Steam library, enriches games with HowLongToBeat estimates, and searches, sorts, filters, caches, and manually refreshes the resulting library view.
</goal>

<context>
Read these files before making changes:
- `docs/superpowers/specs/2026-05-23-hltb-steam-design.md`
- `docs/superpowers/plans/2026-05-23-hltb-steam.md`
- `docs/superpowers/goals/2026-05-23-hltb-steam/PLAN.md`
- `docs/superpowers/goals/2026-05-23-hltb-steam/CONTROL.md`
- `docs/superpowers/goals/2026-05-23-hltb-steam/ATTEMPTS.md`
- `docs/superpowers/goals/2026-05-23-hltb-steam/NOTES.md`

Initial discovery commands:
- `git status --short`
- `rg --files`
- `rg -n "TODO|throw new|try \\{|catch \\(" app components hooks lib tests types auth.ts middleware.ts next.config.ts package.json tsconfig.json`

Treat `docs/superpowers/plans/2026-05-23-hltb-steam.md` as the authoritative implementation workflow. The plan is task-oriented; this `GOAL.md` is the completion contract for `/goal`.
</context>

<constraints>
Architecture constraints:
- Use Next.js 16 App Router with TypeScript.
- Auth must use Auth.js v5 with Steam OpenID through `next-auth-steam`.
- Steam and HLTB calls must run through Next.js Route Handlers, not directly from the browser.
- Cache Steam library responses via `unstorage` fs-driver under `library:{steamId}` with effective TTL 1 hour (enforced on read via `cachedAt`).
- Cache HLTB results, including negative `null` results, via `unstorage` fs-driver under `hltb:{normalizedName}` with effective TTL 7 days.
- Use TanStack Query v5 for client server-state and localStorage persistence.
- Use `unstorage` (fs-driver), shadcn/ui, Tailwind CSS, TanStack Table v8, sonner, `howlongtobeat`, `p-limit`, `date-fns`, `string-similarity`, `errore`, Vitest, and pnpm as specified.
- All non-TanStack-Query app code should follow the errore errors-as-values convention. TanStack Query fetch helpers may throw typed boundary errors because the library expects thrown errors for `isError`.

Scope boundaries:
- Do not add E2E tests.
- Do not add Postgres or another database.
- Do not deploy to Vercel.
- Do not add achievements, reviews, prices, favorites, completed overrides, status filters, or browsing another user's library.
- Do not introduce broad refactors beyond what is needed to complete the plan.
- Do not store secret values in the repo. Only create `.env.local.example`.

Risk boundaries:
- Missing real Steam or NextAuth credentials may block only the manual smoke check, not automated completion. The cache is local (`.cache/`) and requires no credentials.
- If an upstream package API differs from the planned code, adapt conservatively while preserving the spec behavior and record the adjustment in `ATTEMPTS.md`.
- If a generated scaffold differs from the plan because current package versions changed, preserve the intended behavior and document the delta.
</constraints>

<scorecard>
Primary checklist:
- 24 of 24 tasks in `docs/superpowers/plans/2026-05-23-hltb-steam.md` are completed, or a task is explicitly marked blocked only when it depends on missing real credentials for manual smoke.
- All MVP behaviors from the approved spec are implemented: Steam sign-in, authenticated library fetch, HLTB enrichment, table columns, search, five-field sorting, HLTB main-hours range filter, server cache TTLs, manual refresh, and documented setup.
- All listed unit-test surfaces exist and pass: tagged errors, pure filters, HLTB matcher, library merge, Steam client, HLTB client, and KV cache.
- Error handling matches the spec: private profile banner, Steam failure toast/retry path, per-game HLTB graceful degradation, KV failures logged without failing the request, unauthenticated access redirected or rejected.
- Repo hygiene is clean or intentionally documented: no unrelated changes reverted, no secrets committed, no uncommitted implementation files left at completion.

Passing threshold:
- `rtk pnpm test` passes.
- `rtk pnpm tsc --noEmit` passes.
- `rtk pnpm build` passes.
- Manual smoke passes when real credentials are available. If credentials are unavailable, `.env.local.example`, README setup instructions, and all automated checks must pass, and the manual smoke blocker must be stated clearly in the final response.

Regression checks:
- Search is case-insensitive and returns all rows for an empty query.
- HLTB sort nulls are always last in both directions.
- HLTB not found or per-game fetch failure produces `null` entry and does not fail the whole `/api/hltb` response.
- `force=1` for `/api/library` and `force: true` for `/api/hltb` bypass cache reads and update cache writes.
- Private Steam libraries map to a specific private-profile UI state, not a generic crash.

Scoring path:
- Use the plan checkboxes and task verification commands as task-level evidence.
- Use `rtk pnpm test`, `rtk pnpm tsc --noEmit`, and `rtk pnpm build` as final automated evidence.
- Use the manual smoke checklist in Task 24 as user-observable evidence when credentials are available.

Stop condition:
- Stop only when the passing threshold is met and `git status --short` shows no unexpected changes, or when the only remaining gap is the explicitly documented missing-credentials manual smoke blocker.
</scorecard>

<done_when>
The goal is complete when all of the following are true:
- The repo contains the Next.js app files, components, hooks, API routes, types, tests, `.env.local.example`, and README described in `docs/superpowers/plans/2026-05-23-hltb-steam.md`.
- `pnpm` dependencies and scripts support dev, build, test, watch test, and coverage workflows.
- `rtk pnpm test` passes with the planned test coverage.
- `rtk pnpm tsc --noEmit` passes.
- `rtk pnpm build` passes without requiring real secret values at build time.
- `README.md` explains setup, required env vars, scripts, and the public Steam profile requirement.
- `git status --short` is clean or contains only changes intentionally left for the user and reported in the final response.
- If real credentials are available, the manual browser smoke checklist in Task 24 passes: landing page renders, Steam sign-in works, library table populates, HLTB columns fill, search filters live, HLTB Main sorting changes order, slider filters by range, and both refresh buttons disable for 10 seconds and refresh data.
- If real credentials are unavailable, the final response names the skipped manual smoke check and the missing credential category.
</done_when>

<feedback_loop>
Fast checks while iterating:
- After each pure library or matcher change, run the focused test for that file, for example `rtk pnpm test tests/lib/library/filters.test.ts`.
- After each client or route-handler change, run `rtk pnpm tsc --noEmit`.
- After each dependency, config, or scaffold change, run the smallest available compile or smoke command from the current task.

Expected runtime:
- Focused Vitest files should usually finish in under 30 seconds.
- Type-check should usually finish in under 90 seconds for this MVP.
- Full tests and production build are slower and should be saved for phase gates and final verification.

Cadence:
- Use focused tests before implementing the paired production code whenever the task is test-first.
- Run the relevant focused check after each task implementation.
- Run `rtk pnpm test` and `rtk pnpm tsc --noEmit` after completing a cluster of related tasks.
- Run `rtk pnpm build` at the final verification gate and after major Next.js configuration/auth changes if failures suggest integration risk.

Proxy validity:
- Focused unit tests are representative for pure transforms and external boundary wrappers.
- Type-check is representative for route, hook, provider, and component integration.
- Production build is representative for Next.js wiring, imports, server/client boundaries, and env validation behavior.
- Manual smoke is the only representative check for the full Steam OpenID and real Steam/HLTB integration path.

Slower escalation:
- If a focused test passes but behavior is questionable, run the whole test suite.
- If type-check passes but Next.js routing or server/client boundaries changed, run the production build.
- If automated checks pass but credentials exist, run the manual smoke checklist before completion.
</feedback_loop>

<workflow>
Follow `docs/superpowers/plans/2026-05-23-hltb-steam.md` task-by-task.

Phase 0: Orientation
- Read the spec, plan, this goal, and control surface.
- Check `git status --short`.
- Confirm whether the project is empty or already partially scaffolded.
- Update `PLAN.md` with current phase and any discovered state.

Phase 1: Scaffold and tooling
- Complete Tasks 1-4: Next.js scaffold, dependencies, Vitest, shadcn/ui.
- Verify with the commands listed inside each task.
- Record dependency or scaffold drift in `ATTEMPTS.md`.

Phase 2: Domain logic and tests
- Complete Tasks 5-12 with test-first flow where specified.
- Prefer focused Vitest runs after each test/implementation pair.
- Preserve the errore errors-as-values convention outside TanStack Query boundary code.

Phase 3: Auth, routes, and client data
- Complete Tasks 13-17.
- Type-check after each task.
- Keep secrets out of source files and examples blank.

Phase 4: UI and library screen
- Complete Tasks 18-22.
- Keep UI focused on the actual app, not a landing-page marketing treatment.
- Run type-check after component clusters.

Phase 5: Documentation and final verification
- Complete Task 23 README.
- Complete Task 24 automated checks.
- Run manual smoke only when real credentials are present.
- Update `NOTES.md` with any final caveats and `ATTEMPTS.md` with final verification evidence.

Parallelization:
- Batch independent reads and searches.
- Do not run conflicting package manager, test, or dev-server commands in parallel.
</workflow>

<working_memory>
Maintain these files throughout the long run:
- `docs/superpowers/goals/2026-05-23-hltb-steam/PLAN.md`
- `docs/superpowers/goals/2026-05-23-hltb-steam/ATTEMPTS.md`
- `docs/superpowers/goals/2026-05-23-hltb-steam/NOTES.md`

Update cadence:
- Update `PLAN.md` when the current phase, task range, strategy, or blocker changes.
- Update `ATTEMPTS.md` after each meaningful task cluster, failed approach, dependency/API drift adjustment, or final verification command.
- Update `NOTES.md` for durable discoveries that should survive context compaction, such as package API differences, auth/provider quirks, env assumptions, or manual-smoke blockers.

Do not rely only on chat history for progress. The working-memory files are the source of continuity for long `/goal` execution.
</working_memory>

<human_control_surface>
Use `docs/superpowers/goals/2026-05-23-hltb-steam/CONTROL.md` as the compact human operator panel.

Before each phase change, strategic pivot, dependency change, expensive network-heavy step, manual smoke attempt, or sidecar input ingestion, reread `CONTROL.md`. If it changed, summarize the relevant change in `PLAN.md` and adapt before continuing.

The control surface can narrow scope, adjust priority, pause manual smoke, or require approval. It cannot silently weaken the `done_when` criteria, scorecard threshold, or approved MVP behavior.
</human_control_surface>

<verification_loop>
Focused verification:
- Run the task-specific Vitest commands listed in Tasks 5, 7, 8, 9, 10, 11, and 12.
- Run `rtk pnpm tsc --noEmit` after type, route, hook, provider, and UI integration tasks.

Final automated verification:
- `rtk pnpm test`
- `rtk pnpm tsc --noEmit`
- `rtk pnpm build`
- `rtk git status`

Manual verification when credentials are available:
- Start the app with `rtk pnpm dev`.
- Open `http://localhost:3000`.
- Complete the Task 24 manual smoke checklist.
- Stop the dev server before finishing.

Fallback when checks cannot run:
- If a command fails because dependencies are missing or network access is blocked, install or request the needed access according to the runtime rules, then rerun the command.
- If real Steam or NextAuth credentials are unavailable, skip only the manual smoke path and report that limitation explicitly.
- Do not mark the goal complete with failing automated checks.
</verification_loop>

<execution_rules>
- Check git status before edits.
- Preserve unrelated user changes.
- Prefer `rg` over `grep` when available.
- Use the runtime's patch/edit tool for manual edits when available.
- Read context files before implementation.
- Batch independent file reads in parallel when the runtime supports it.
- Keep the goal scorecard current: know the primary metric, passing threshold, regression checks, scoring method, and stop condition.
- Use the fastest representative feedback check while iterating; reserve slower checks for escalation points and final verification.
- Maintain `PLAN.md`, `ATTEMPTS.md`, `NOTES.md`, and `CONTROL.md` for this long-running goal.
- Update `ATTEMPTS.md` after each meaningful approach so future iterations do not repeat work without new evidence.
- Run focused tests before broad tests.
- Do not paper over failures.
- Do not widen scope.
- Do not commit real secrets.
- Keep the final answer concise.
</execution_rules>

<output_contract>
Final artifacts:
- Completed app implementation matching `docs/superpowers/specs/2026-05-23-hltb-steam-design.md`.
- Updated working-memory files under `docs/superpowers/goals/2026-05-23-hltb-steam/`.
- README setup and verification instructions.
- Passing automated verification evidence.

Final response:
- Summarize what was completed.
- Report the final verification commands and results.
- State whether manual smoke was completed or skipped due to missing credentials.
- Mention any remaining intentional limitations or user actions.
</output_contract>
