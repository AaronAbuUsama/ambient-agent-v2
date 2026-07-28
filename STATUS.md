# Status

Last updated: 2026-07-28.

## Static foundation proven (P0)

- The replacement GitHub repository exists independently from the old implementation.
- Build 0 foundation validation runs as TypeScript through repository-pinned Nub with no
  application dependencies.
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
- Runtime callers durably admit through
  `createCoworker(...).admitConversationEvent(...)` without waiting for global reasoning;
  background processing resumes through `runUntilIdle()`.
- Internal owner and interruption helpers are absent from the package root and available only
  from the explicit proof subpath.
- All eight durable-boundary interruption runs converge to the same canonical database and
  one provider delivery with zero duplicate external effects.
- The same Build 2 spine gate passes on merged commit `7b581ba`.

## Externally proven (local P4)

- Clean implementation commit `08e74a4` ran one synthetic Conversation Event through real
  OpenCode Go `glm-5.1` inference for the global Scribe, one Brain, and one Speaker.
- Each role produced schema-validated structured output and real provider response IDs with
  non-zero token usage. The observed Speaker output contained none of the persisted
  application identities or role/implementation markers checked by the proof, and did not
  add the unstated year `2026`.
- Trusted Coworker code assigned the durable Attestation, Attention, Brain Batch, and Effect
  identities, then settled one synthetic Surface delivery with zero duplicates.
- The ignored local receipt is
  `receipts/build-3a/2026-07-28T11-25-03.800Z/receipt.json`; its finalized SQLite artifact
  hashes to `2f8ad28bf3c98da2d801153fc2daa8dbb7b015b47f1cce2fc016ea4fff43f659`.
- This proves the real model boundary only. It does not prove WhatsApp or replay of an
  unrecorded model output after process interruption.

## Mechanically green

- `pnpm typecheck` passes for the runtime, agent, Coworker, and eval packages.
- `pnpm test` builds the artifacts and passes the Flue recovery and synthetic-spine scenarios.
- `pnpm evals` passes generated-invariant E0, recorded-fixture E1, and curated-rubric E2.
- `pnpm check` validates repository canon and runs typecheck, build, both proofs, and evals.
- Repository scripts, tests, and eval runners are TypeScript executed through pinned Nub
  `0.6.0`; emitted runtime JavaScript remains the process artifact.
- Credential-free CI skips the opt-in real-model test explicitly; the P4 command is local and
  separate from deterministic `pnpm check`.
- GitHub CI passes on Build 1 PR #2.
- GitHub CI passed on ready Build 2 PR #3 head `c2c76e5`; merged-commit runtime proof is
  recorded separately above.

## Human-only validation

- No P6 human-acceptance proof is required or claimed for Builds 1–3A.

## Designed, not built

- Build 3: live WhatsApp coworker.
- Build 4: GitHub work loop.
- Build 5: hosted tenant isolation and control plane.
- Production replacement and data/identity cutover.

## Not proven / explicitly absent

- No WhatsApp or GitHub integration.
- No model-output replay proof across a process interruption.
- No Braintrust publication; its adapter is opt-in and unproven.
- No provider or Braintrust credential is committed or available to CI.
- No VPS deployment.
- No multi-tenant isolation or production-runtime claim.

Build 3A's implementation and local P4 proof are complete on the branch. Its final-head CI,
PR merge, and merged-commit proof remain required before Build 3 becomes the legal
implementation step defined in [`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md).
