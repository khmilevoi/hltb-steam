# NOTES

## Chronological Notes

- 2026-05-23: The original implementation plan is detailed and executable but is not itself a `/goal` contract. The new `GOAL.md` wraps it with required scorecard, done_when, feedback loop, working memory, control surface, verification loop, execution rules, and output contract.
- 2026-05-23: Manual smoke is credential-dependent. Missing credentials should block only the manual browser path, not automated verification.
- 2026-05-23: Implementation is starting from an empty repo on branch `hltb-steam`. `GOAL.md` originally specified Upstash Redis in constraints while the spec and plan use `unstorage` fs-driver with `.cache/`. This was reconciled by editing `GOAL.md` (constraints, risk_boundaries, feedback_loop, verification_loop) to match the spec and plan. Server-side cache is local files; no third-party storage credentials are required.
- 2026-05-23: Current `create-next-app@latest` generated a `src/app` scaffold and modern Tailwind 4 files (`postcss.config.mjs`, no `tailwind.config`). The app directory was moved to root `app/` to preserve the approved project structure.
- 2026-05-23: `next-auth-steam@0.4.0` installed as planned but reports peer warnings for Next 16 and Auth.js v5. Keep the dependency for now and validate the provider wiring in Task 13.
- 2026-05-23: Current shadcn CLI no longer supports `--base-color`; project was initialized with Radix base and `nova` preset. Components use the current shadcn source format.
- 2026-05-23: `errore@0.14.1` reserves `$name` in tagged-error message templates. `HltbFetchError` keeps the planned public constructor shape but uses `$gameName` internally for interpolation.
- 2026-05-23: `next-auth-steam@0.4.0` needs wrapping for Auth.js v5: add `token.url` and `userinfo.url` metadata around its custom request handlers. It also requires `process.env.NEXTAUTH_URL` during provider construction, so `auth.ts` supplies a local fallback.
- 2026-05-23: Do not import the Steam Auth.js config from Next middleware/proxy. `next-auth-steam` imports `node:crypto`, which is not supported by the Edge runtime. `/library` is protected by its server page `auth()` gate and API routes call `auth()` directly.
