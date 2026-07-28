# ADR 0004: Separate the control plane from tenant runtimes

Status: accepted, 2026-07-28.

## Context

The product should eventually serve many tenants, but each tenant must experience one Coworker
with isolated identity, memory, credentials, and work. Putting customer administration and
tenant reasoning in one process confuses global product state with a tenant's Brain.

## Decision

Keep one product and repository with two deployment roles:

- `apps/runtime`: one isolated tenant Coworker;
- `apps/control-plane`: account, provisioning, configuration, and runtime lifecycle.

The control plane provisions over explicit network contracts and never imports runtime
internals. Build 5 introduces it; earlier builds only preserve the boundary.

## Consequences

- The single-tenant runtime can be completed before SaaS machinery.
- Multi-tenancy composes proven runtimes rather than changing Brain semantics.
- Tenant failures and credentials remain isolated.
- No speculative control-plane package is created before Build 5.
