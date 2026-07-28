# Environments

## Decision

Development is local-first. Persistent external proof uses an isolated staging runtime.
Production remains on the existing service until the final cutover.

## Matrix

| Build | Local | CI | Staging | Production |
|---|---|---|---|---|
| Build 0 | required | required | absent | untouched |
| Build 1 | primary | required | optional recovery confirmation | untouched |
| Build 2 | primary | required | unnecessary | untouched |
| Build 3A | required real-model P4 | mechanical only | unnecessary | untouched |
| Build 3 | primary provider proof | mechanical only | required restart/soak | untouched |
| Build 4 | fixture/tunnel proof | mechanical only | required webhook/soak | untouched |
| Build 5 | contract development | mechanical only | required two-tenant proof | untouched |
| Cutover | preparation | final commit checks | rehearsal | replacement |

## Local

Local development owns fast feedback, deterministic scenarios, model benchmarking, provider
fixture replay, and initial live integration. No production credential is required before
cutover.

WhatsApp uses an outbound connection and can run locally. GitHub outbound API calls can run
locally; live inbound webhooks require a temporary HTTPS tunnel or staging endpoint.

## CI

CI receives the minimum credentials for the active proof. Deterministic checks never require
provider credentials. Live provider proofs are not disguised as CI coverage.

## Staging

The first staging deployment may share the current VPS only after a resource/port audit, but
must have:

- a distinct service name and Unix user where practical;
- a distinct port and health endpoint;
- a distinct database and data directory;
- distinct WhatsApp and GitHub development identities;
- a distinct webhook hostname;
- no access to production chats or repositories;
- an immutable build artifact produced from the proven commit.

If those boundaries cannot be guaranteed on the existing VPS, use a separate staging VPS.

## Production

Production external identities are not “on the VPS”:

- GitHub App registration and installation live at GitHub.
- GitHub App keys and webhook secrets live in runtime secret custody.
- The webhook URL points at the current deployed ingress.
- The WhatsApp identity lives at the provider; its durable session material lives in the tenant
  database.

The host is replaceable. The database, external registrations, credentials, and stable
application identities are the continuity boundary.

## Credential progression

| Build | Credential |
|---|---|
| Build 0 | GitHub repository authentication only |
| Build 1 | development model provider |
| Build 2 | none; deterministic local provider only |
| Build 3A | OpenCode Go development credential; Braintrust remains optional and unproven |
| Build 3 | dedicated development WhatsApp account |
| Build 4 | dedicated development GitHub App and sandbox repository |
| Build 5 | staging control-plane and per-tenant secrets |
| Cutover | production credentials under an explicit checklist |

Do not copy the existing production WhatsApp session to a laptop or run the same account from
two runtimes. Prefer explicit re-pairing at cutover unless session migration is separately
proven.
