# Ambient Agent v2

The clean replacement implementation of Ambient Agent: one coworker with one Brain, one
owned Graph, one global Scribe, and one Speaker per conversation surface.

This repository is being built independently from the existing
[`ambient-agent`](https://github.com/AaronAbuUsama/ambient-agent) repository. The old
repository is a source of validated lessons and narrow donor code, not a structural base.

## Current state

**Build 2 implements the synthetic Coworker core spine.**

One synthetic Conversation Event now crosses the real application boundaries: immutable
Archive, evidence-bearing Scribe Attestation, deterministic Graph projection, durable
Attention, stable Brain Batch, typed Brain Effect, and an idempotent synthetic Surface. The
interruption matrix proves convergence after every durable boundary. See [`STATUS.md`](./STATUS.md)
for the exact built-versus-proven boundary.

## Canon

Read these in order:

1. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system and code ownership.
2. [`docs/DOMAIN.md`](./docs/DOMAIN.md) — ratified language.
3. [`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md) — Build 0 through production cutover.
4. [`docs/PROOF-CONTRACT.md`](./docs/PROOF-CONTRACT.md) — what counts as evidence.
5. [`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md) — local, staging, and production.
6. [`docs/EVALS.md`](./docs/EVALS.md) — evaluation and model-benchmark methodology.
7. [`docs/CUTOVER.md`](./docs/CUTOVER.md) — replacement and rollback procedure.

## Checks and runnable proofs

```bash
corepack enable
pnpm install
pnpm check
pnpm demo:recovery
pnpm demo:spine
pnpm evals
pnpm evals:benchmark
```

The proofs and E0–E2 eval floor are deterministic and require no production credentials.
Generated SQLite databases, reports, and receipts live under the ignored `receipts/` directory.
Repository scripts, tests, and eval runners are TypeScript executed by the pinned Nub
development dependency; `pnpm` remains the package manager.
