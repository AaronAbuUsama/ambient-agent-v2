# Ambient Agent v2

The clean replacement implementation of Ambient Agent: one coworker with one Brain, one
owned Graph, one global Scribe, and one Speaker per conversation surface.

This repository is being built independently from the existing
[`ambient-agent`](https://github.com/AaronAbuUsama/ambient-agent) repository. The old
repository is a source of validated lessons and narrow donor code, not a structural base.

## Current state

**Build 3.1 adds provider-neutral Conversation Intake and stable Surface Binding on top of the
proven real-model spine.**

Trusted code now derives stable Conversation Event identity, archives normalized arrivals,
edits, revocations, reactions, and receipts, and admits only useful live inbound arrivals from
already-bound Surfaces. Unauthorized conversations remain durable Archive evidence without
creating Attention. See [`STATUS.md`](./STATUS.md) for the exact built-versus-proven boundary.

The opt-in Build 3A proof sends the same application flow through real Flue Scribe, Brain, and
Speaker agents using OpenCode Go. New test inference defaults to DeepSeek V4 Flash, while the
merged GLM-5.1 receipt remains the historical Build 3A proof.

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
pnpm demo:intake
OPENCODE_GO_API_KEY=<development-key> pnpm demo:real-model
pnpm evals
pnpm evals:benchmark
```

The default checks and E0–E2 eval floor are deterministic and require no provider credential.
`demo:real-model` is an explicit local P4 proof and is never part of credential-free CI.
Generated SQLite databases, reports, and receipts live under the ignored `receipts/` directory.
Repository scripts, tests, and eval runners are TypeScript executed by the pinned Nub
development dependency; `pnpm` remains the package manager.
