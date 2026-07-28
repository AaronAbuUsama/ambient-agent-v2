# Ambient Agent v2

The clean replacement implementation of Ambient Agent: one coworker with one Brain, one
owned Graph, one global Scribe, and one Speaker per conversation surface.

This repository is being built independently from the existing
[`ambient-agent`](https://github.com/AaronAbuUsama/ambient-agent) repository. The old
repository is a source of validated lessons and narrow donor code, not a structural base.

## Current state

**Build 0 is the repository foundation. No application runtime exists yet.**

The durable plan, dependency laws, environment boundaries, evaluation methodology, proof
contract, and production cutover are defined here before Build 1 introduces application
code. See [`STATUS.md`](./STATUS.md) for the honest built-versus-planned boundary.

## Canon

Read these in order:

1. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system and code ownership.
2. [`docs/DOMAIN.md`](./docs/DOMAIN.md) — ratified language.
3. [`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md) — Build 0 through production cutover.
4. [`docs/PROOF-CONTRACT.md`](./docs/PROOF-CONTRACT.md) — what counts as evidence.
5. [`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md) — local, staging, and production.
6. [`docs/EVALS.md`](./docs/EVALS.md) — evaluation and model-benchmark methodology.
7. [`docs/CUTOVER.md`](./docs/CUTOVER.md) — replacement and rollback procedure.

## Build 0 check

```bash
corepack enable
pnpm install
pnpm check
```

Build 0 deliberately has no application dependencies and requires no production credentials.
