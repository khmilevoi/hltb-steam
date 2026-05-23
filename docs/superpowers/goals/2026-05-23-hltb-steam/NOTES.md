# NOTES

## Chronological Notes

- 2026-05-23: The original implementation plan is detailed and executable but is not itself a `/goal` contract. The new `GOAL.md` wraps it with required scorecard, done_when, feedback loop, working memory, control surface, verification loop, execution rules, and output contract.
- 2026-05-23: Manual smoke is credential-dependent. Missing credentials should block only the manual browser path, not automated verification.
- 2026-05-23: Implementation is starting from an empty repo on branch `hltb-steam`. `GOAL.md` originally specified Upstash Redis in constraints while the spec and plan use `unstorage` fs-driver with `.cache/`. This was reconciled by editing `GOAL.md` (constraints, risk_boundaries, feedback_loop, verification_loop) to match the spec and plan. Server-side cache is local files; no third-party storage credentials are required.
- 2026-05-23: Current `create-next-app@latest` generated a `src/app` scaffold and modern Tailwind 4 files (`postcss.config.mjs`, no `tailwind.config`). The app directory was moved to root `app/` to preserve the approved project structure.
