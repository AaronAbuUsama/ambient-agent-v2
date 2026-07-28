# Status

Last updated: 2026-07-28.

## Static foundation proven (P0)

- The replacement GitHub repository exists independently from the old implementation.
- Build 0 foundation validation runs as TypeScript through repository-pinned Nub with no
  application dependencies.
- The architecture, domain language, build order, proof contract, environment strategy,
  evaluation methodology, decisions, and cutover contract are versioned together.

## Runtime proven

- Build 1's built Node artifact durably admits one agent prompt to SQLite.
- A local P3 recovery run killed the process with `SIGKILL` during the first model request,
  restarted against the same database, and settled the same submission with one
  `RECOVERED_ONCE` assistant message, zero duplicates, and one recovered model attempt.
- Unauthenticated conversation inspection is rejected with HTTP 401.
- The same recovery gate passes on merged Build 1 commit `a81e5ac`.
- Build 2's synthetic Conversation Event crosses Archive, Scribe Attestation, Graph,
  Attention, one stable Brain Batch, one typed Brain Effect, and one synthetic Surface.
- Build 3.1 replaces the proof-shaped admission call with
  `bindSurface(...)` and `observeConversationEvent(...)`. Observation durably archives every
  normalized event; only a useful live inbound arrival already bound to an active Surface
  creates Attention. Background processing remains separate through `runUntilIdle()`.
- Internal owner and interruption helpers are absent from the package root and available only
  from the explicit proof subpath.
- All eight durable-boundary interruption runs converge to the same canonical database and
  one provider delivery with zero duplicate external effects.
- The same Build 2 spine gate passes on merged commit `7b581ba`.
- Build 3.1's `pnpm demo:intake` passed locally on clean merged commit `71aaaec`. Its receipt archived
  one authorized arrival plus seven archive-only cases (unauthorized arrival, outbound
  arrival, empty inbound arrival, edit, revocation, reaction, and receipt), created exactly
  one Attention item, invoked no reasoner or Surface delivery, and persisted no supplied raw
  provider envelope.
- The ignored local receipt is
  `receipts/build-3-1/2026-07-28T15-16-16.017Z/receipt.json`; its finalized SQLite artifact
  hashes to `9a1173990a9a64532b6e20accc08d7648c27c46610d4f2196e4b178d2ffaea60`.
- This Build 3.1 receipt is local P2 only. It does not prove process-interruption recovery,
  real WhatsApp normalization, or external delivery.
- Build 3.2's `pnpm demo:delivery` passed locally on clean commit `036e9bf`. Its sent path
  recorded provider evidence; its failed and indeterminate-call paths each created new
  delivery-sourced Attention; and restart from durable `attempting` became `uncertain` without
  invoking the provider.
- The ignored local receipt is
  `receipts/build-3-2/2026-07-28T15-41-53.900Z/receipt.json`. Its sent, failed, uncertain, and
  interrupted SQLite artifacts respectively hash to
  `a583fe75c8f3844f024181f28fd0dda488cc5e3162ab7e11a3217b0d4d77adb5`,
  `d8830a8cdd12273c3a55eb4b2f154ef08e208cfb03975fe80db95312899a25d8`,
  `f80dd63dc60a3efe1b1b4410da761b2cf4c7d8aa34d9c8cff4f81945dc75287c`, and
  `c97ea5a124c73f8bc999b02b62279470334516a363416bca9a1991d23c1916e8`.
- This is a synthetic local P3 state-machine proof. It does not prove real WhatsApp delivery,
  provider reconciliation of uncertainty, or OS process termination during a provider call.

## Externally proven (local P4)

- Merged commit `ab73b1b` ran one synthetic Conversation Event through real
  OpenCode Go `glm-5.1` inference for the global Scribe, one Brain, and one Speaker.
- Each role produced schema-validated structured output and real provider response IDs with
  non-zero token usage. The observed Speaker output contained none of the persisted
  application identities or role/implementation markers checked by the proof, and did not
  add the unstated year `2026`.
- Trusted Coworker code assigned the durable Attestation, Attention, Brain Batch, and Effect
  identities, then settled one synthetic Surface delivery with zero duplicates.
- The ignored local receipt is
  `receipts/build-3a/2026-07-28T11-48-45.706Z/receipt.json`; its finalized SQLite artifact
  hashes to `c80399d7d2a0e00e822b216e61e2af9afc4ebf5635eebcb2fce6dbeed568590f`.
- This proves the real model boundary only. It does not prove WhatsApp or replay of an
  unrecorded model output after process interruption.

## Mechanically green

- `pnpm typecheck` passes for the runtime, agent, Coworker, and eval packages.
- `pnpm test` builds the artifacts and passes the Flue recovery and synthetic-spine scenarios.
- `pnpm evals` passes generated-invariant E0, recorded-fixture E1, and curated-rubric E2.
- `pnpm check` validates repository canon and runs typecheck, build, both proofs, and evals.
- `pnpm check` passed on merged Build 3.1 commit `71aaaec`, including the prior-schema
  migration regression and the normalized-intake receipt test.
- `pnpm check` passed on Build 3.2 implementation commit `036e9bf`, including legacy delivery
  evidence migration, the four delivery outcomes, and the updated interruption matrix.
- Repository scripts, tests, and eval runners are TypeScript executed through pinned Nub
  `0.6.0`; emitted runtime JavaScript remains the process artifact.
- Credential-free CI skips the opt-in real-model test explicitly; the P4 command is local and
  separate from deterministic `pnpm check`.
- GitHub CI passes on Build 1 PR #2.
- GitHub CI passed on ready Build 2 PR #3 head `c2c76e5`; merged-commit runtime proof is
  recorded separately above.
- GitHub CI passed on ready Build 3A PR #5 head `c4c455d`; merged-commit external proof is
  recorded separately above.
- GitHub CI passed on ready Build 3.1 PR #7 head `2eecf2b`; the PR merged as `71aaaec` and
  merged-commit runtime proof is recorded separately above.

## Human-only validation

- No P6 human-acceptance proof is required or claimed for Builds 1–3A.

## Designed, not built

- Build 3.3–3.5: durable Brain/Speaker identity, thin WhatsApp adapter, and live
  local/staging/human proof.
- Build 4: GitHub work loop.
- Build 5: hosted tenant isolation and control plane.
- Production replacement and data/identity cutover.

## Not proven / explicitly absent

- No WhatsApp or GitHub integration.
- No interruption/restart proof for normalized Conversation Intake.
- No model-output replay proof across a process interruption.
- No Braintrust publication; its adapter is opt-in and unproven.
- No provider or Braintrust credential is committed or available to CI.
- No VPS deployment.
- No multi-tenant isolation or production-runtime claim.

Build 3.2 is implemented and synthetically P3-proven on `036e9bf`, but its final-head CI, PR
merge, and merged-commit proof are pending. Build 3.3 is not yet the legal frontier.
