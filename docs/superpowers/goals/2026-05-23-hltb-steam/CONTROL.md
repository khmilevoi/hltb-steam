# CONTROL

## Status Contract

status_file: docs/superpowers/goals/2026-05-23-hltb-steam/PLAN.md
attempt_log: docs/superpowers/goals/2026-05-23-hltb-steam/ATTEMPTS.md
durable_notes: docs/superpowers/goals/2026-05-23-hltb-steam/NOTES.md
update_memory_after: every_task_cluster
check_control_before: phase_change, strategic_pivot, dependency_change, expensive_step, manual_smoke

## Human Priorities

primary_priority: correctness
secondary_priority: maintainability

## Scope Knobs

allowed_files:
- app/**
- components/**
- hooks/**
- lib/**
- tests/**
- types/**
- docs/superpowers/goals/2026-05-23-hltb-steam/**
- README.md
- package.json
- pnpm-lock.yaml
- tsconfig.json
- next.config.ts
- vitest.config.ts
- components.json
- auth.ts
- middleware.ts
- .env.local.example
- .gitignore

protected_files:
- .env.local
- .env*

max_blast_radius: MVP app implementation described by the approved spec and plan.

## Resource Knobs

max_runtime_per_step: none
max_parallel_jobs: 2
network_allowed: approval_required
external_api_allowed: approval_required

## Decision Gates

require_approval_for:
- strategic_pivot
- destructive_change
- dependency_change_not_listed_in_plan
- schema_or_migration_change
- public_api_change
- scope_expansion
- committing_real_secret_values

## Sidecar Inputs

sidecar_apply_cadence: before_phase_change
nudge_file: none
human_overlay_file: none
review_queue_file: none

## Latest Human Nudge

Proceed with converting the implementation plan into `/goal`-ready artifacts.
