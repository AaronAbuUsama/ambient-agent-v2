# Status

Last updated: 2026-07-28.

## Proven

- The replacement GitHub repository exists independently from the old implementation.
- Build 0 foundation validation runs with Node and no application dependencies.
- The architecture, domain language, build order, proof contract, environment strategy,
  evaluation methodology, decisions, and cutover contract are versioned together.
- Build 1's built Node artifact durably admits one agent prompt to SQLite.
- A local P3 recovery run killed the process with `SIGKILL` during the first model request,
  restarted against the same database, and settled the same submission with one
  `RECOVERED_ONCE` assistant message, zero duplicates, and one recovered model attempt.
- Unauthenticated conversation inspection is rejected with HTTP 401.

## Mechanically green

- `pnpm typecheck` passes for the runtime and agent packages.
- `pnpm test` builds the Node artifact and passes the deterministic forced-restart scenario
  locally.
- `pnpm check` validates the foundation, typecheck, build, and recovery test locally.
- CI and merged-commit recovery proof remain pending until this Build 1 PR is pushed and
  merged.

## Designed, not built

- Build 2: synthetic coworker core spine.
- Build 3: live WhatsApp coworker.
- Build 4: GitHub work loop.
- Build 5: hosted tenant isolation and control plane.
- Production replacement and data/identity cutover.

## Explicitly absent

- No WhatsApp or GitHub integration.
- No Coworker domain modules, Brain, Scribe, Graph, Archive, attention, or effects.
- No model or Braintrust credential.
- No VPS deployment.
- No multi-tenant isolation or production-runtime claim.

The next stage boundary is the Build 1 ready PR, CI, merge, and merged-commit recovery proof.
Only then is Build 2 the legal implementation step defined in
[`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md).
