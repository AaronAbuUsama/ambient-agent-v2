# Ambient Agent v2

The clean replacement implementation of Ambient Agent: one coworker with one Brain, one
owned Graph, one global Scribe, and one Speaker per conversation surface.

This repository is being built independently from the existing
[`ambient-agent`](https://github.com/AaronAbuUsama/ambient-agent) repository. The old
repository is a source of validated lessons and narrow donor code, not a structural base.

## Current state

**Build 1 implements the local durable Flue v2 Node recovery floor.**

One real Flue agent is mounted behind operator authentication, persists its conversation in a
tenant SQLite database, and has an executable proof that kills the Node process during a model
request, restarts it against the same database, and observes one terminal continuation for the
same submission. See [`STATUS.md`](./STATUS.md) for the exact built-versus-proven boundary.

## Canon

Read these in order:

1. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system and code ownership.
2. [`docs/DOMAIN.md`](./docs/DOMAIN.md) — ratified language.
3. [`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md) — Build 0 through production cutover.
4. [`docs/PROOF-CONTRACT.md`](./docs/PROOF-CONTRACT.md) — what counts as evidence.
5. [`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md) — local, staging, and production.
6. [`docs/EVALS.md`](./docs/EVALS.md) — evaluation and model-benchmark methodology.
7. [`docs/CUTOVER.md`](./docs/CUTOVER.md) — replacement and rollback procedure.

## Check and recovery proof

```bash
corepack enable
pnpm install
pnpm check
pnpm demo:recovery
```

The recovery proof uses a deterministic local model endpoint and requires no production
credentials. It writes its SQLite database and JSON receipt under the ignored `receipts/`
directory.
