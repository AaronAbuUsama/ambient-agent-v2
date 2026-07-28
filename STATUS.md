# Status

Last updated: 2026-07-28.

## Static foundation proven (P0)

- The replacement GitHub repository exists independently from the old implementation.
- Build 0 foundation validation runs with Node and no application dependencies.
- The architecture, domain language, build order, proof contract, environment strategy,
  evaluation methodology, decisions, and cutover contract are versioned together.

## Runtime proven (local P3)

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
- GitHub CI passes on Build 1 PR #2.
- Merged-commit recovery proof remains pending until PR #2 is merged.

## Human-only validation

- No P6 human-acceptance proof is required or claimed for Build 1.

## Designed, not built

- Build 2: synthetic coworker core spine.
- Build 3: live WhatsApp coworker.
- Build 4: GitHub work loop.
- Build 5: hosted tenant isolation and control plane.
- Production replacement and data/identity cutover.

## Not proven / explicitly absent

- No WhatsApp or GitHub integration.
- No Coworker domain modules, Brain, Scribe, Graph, Archive, attention, or effects.
- No real external model/provider inference; Build 1 uses a deterministic local provider.
- No model or Braintrust credential.
- No VPS deployment.
- No multi-tenant isolation or production-runtime claim.

The next stage boundary is the Build 1 ready PR, CI, merge, and merged-commit recovery proof.
Only then is Build 2 the legal implementation step defined in
[`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md).
