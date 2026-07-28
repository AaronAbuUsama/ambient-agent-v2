# Status

Last updated: 2026-07-28.

## Proven

- The replacement GitHub repository exists independently from the old implementation.
- Build 0 foundation validation runs with Node and no application dependencies.
- The architecture, domain language, build order, proof contract, environment strategy,
  evaluation methodology, decisions, and cutover contract are versioned together.

## Mechanically green

- `pnpm check` validates the Build 0 artifact set and the cross-document build ledger.
- GitHub CI runs the same check on a clean checkout.

## Designed, not built

- Build 1: durable Flue v2 Node recovery floor.
- Build 2: synthetic coworker core spine.
- Build 3: live WhatsApp coworker.
- Build 4: GitHub work loop.
- Build 5: hosted tenant isolation and control plane.
- Production replacement and data/identity cutover.

## Explicitly absent

- No application package.
- No Flue runtime.
- No database schema.
- No WhatsApp or GitHub integration.
- No model or Braintrust credential.
- No VPS deployment.
- No claim that the target architecture works at runtime.

The next legal implementation step is Build 1 as defined in
[`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md).
