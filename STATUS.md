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
- The same recovery gate passes on merged Build 1 commit `a81e5ac`.
- Build 2's synthetic Conversation Event crosses Archive, Scribe Attestation, Graph,
  Attention, one stable Brain Batch, one typed Brain Effect, and one synthetic Surface.
- All eight durable-boundary interruption runs converge to the same canonical database and
  one provider delivery with zero duplicate external effects.

## Mechanically green

- `pnpm typecheck` passes for the runtime, agent, Coworker, and eval packages.
- `pnpm test` builds the artifacts and passes the Flue recovery and synthetic-spine scenarios.
- `pnpm evals` passes generated-invariant E0, recorded-fixture E1, and curated-rubric E2.
- `pnpm check` validates repository canon and runs typecheck, build, both proofs, and evals.
- GitHub CI passes on Build 1 PR #2.
- GitHub CI passed on ready Build 2 PR #3 at head `bb10de1`; this is PR-head mechanical
  evidence, not merged-commit proof.

## Human-only validation

- No P6 human-acceptance proof is required or claimed for Builds 1–2.

## Designed, not built

- Build 3: live WhatsApp coworker.
- Build 4: GitHub work loop.
- Build 5: hosted tenant isolation and control plane.
- Production replacement and data/identity cutover.

## Not proven / explicitly absent

- No WhatsApp or GitHub integration.
- No real model judgment or external model/provider inference.
- No Braintrust publication; its adapter is opt-in and unproven.
- No model or Braintrust credential.
- No VPS deployment.
- No multi-tenant isolation or production-runtime claim.

The next stage boundary is final-head CI, merge, and a merged-commit Build 2 spine proof.
Only then is Build 3 the legal implementation step defined in
[`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md).
