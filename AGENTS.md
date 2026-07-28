# AGENTS.md

Operating contract for coding agents in this repository.

## Orient first

Read the canon in this order:

1. `docs/ARCHITECTURE.md`
2. `docs/DOMAIN.md`
3. `docs/BUILD-PLAN.md`
4. `docs/PROOF-CONTRACT.md`
5. `STATUS.md`

Do not infer readiness from directory names, plans, passing CI, or the old repository.
`STATUS.md` is the honest built-versus-designed boundary.

## Repository boundary

- This is a clean replacement repository.
- The old `ambient-agent` repository is a quarry: inspect it for validated behavior and
  lessons, but do not copy its module structure or mixed runtime ownership.
- Port the smallest validated behavior needed by the active build. Do not bulk-copy code.
- Do not create empty packages, placeholder interfaces, or control-plane scaffolding.

## Architecture laws

- `packages/coworker` owns application truth and contains no Flue, WhatsApp, or GitHub SDK
  imports.
- `packages/agents` contains Flue agent definitions and depends only on Flue, its schema
  validation library, and `packages/coworker`.
- `apps/runtime` is the composition root for one tenant. External SDKs terminate here.
- `apps/control-plane` provisions runtimes over the network and never imports runtime
  internals.
- One tenant has one physical SQL database. Table ownership remains explicit; packages do
  not write each other's tables.
- The Brain decides. Speakers converse. The Scribe proposes knowledge. External effects are
  executed by typed application ports.
- Reviewers inspect every PR diff for these laws. They are architectural judgement, not a
  custom source-scanning gate.

## Work flow

- Branch from `main` using the `codex/` prefix.
- Open ready-for-review PRs into `main`; never create draft PRs.
- Build only the next accepted build contract from `docs/BUILD-PLAN.md`.
- Prefer deletion, standard library, platform features, and existing dependencies.
- Add dependencies only when the active build proves they are necessary.
- Use codebase-memory graph tools before text search once this repository is indexed.

## Proof language

Always distinguish:

- **Mechanically green** — automated checks passed.
- **Runtime proven** — the built artifact completed its real runtime scenario.
- **Human-only proven** — an operator observed the external behavior.
- **Not proven** — designed, mocked, inferred, or still blocked.

Every non-trivial build leaves its smallest runnable proof in the repository and records an
immutable receipt according to `docs/PROOF-CONTRACT.md`.
