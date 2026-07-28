# ADR 0002: Use Node with local-first development and hosted proof

Status: accepted, 2026-07-28.

## Context

The first complete product is one tenant runtime. Node is easy to run locally and on the
existing VPS. Cloudflare could remove some host-level process coordination, but would add a new
deployment substrate before the application ownership and recovery model are proven.

## Decision

Target Flue v2 on Node. Develop and validate locally and in CI. Deploy the same immutable
artifact to isolated staging for persistent provider, restart, and soak proofs.

Build 1 pins the Flue runtime, SDK, and CLI to
`2.0.0-nightly.202607240825`. Vite owns the Node build, and Flue's supported file-SQLite
adapter owns its durable conversation tables. A version change must rerun the forced-restart
proof before it can merge.

## Consequences

- Builds 0–2 require no VPS.
- Builds 3–5 add staging only when their external proof requires it.
- Host leases/health are deployment concerns, not application truth.
- Build 1 recovery waits for the abandoned runtime lease to expire; the measured local proof
  resumes in approximately 30 seconds.
- A future target change remains possible because `packages/coworker` contains no Node hosting
  or Flue imports.
