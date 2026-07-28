# ADR 0003: Use one physical SQL database per tenant

Status: accepted, 2026-07-28.

## Context

Multiple databases make atomic admission and recovery harder to reason about and can allow
application truth, Flue delivery state, and provider session state to disagree. The runtime
does not need independent scaling boundaries yet.

## Decision

Use one physical SQL database for each tenant runtime. Application modules, the Flue adapter,
and the WhatsApp adapter own distinct tables/namespaces and never write each other's state.
Cross-owner invariants are implemented by application use cases and transactions.

## Consequences

- Backup, restore, and tenant deletion have one durability boundary.
- Archive and attention admission can share one transaction.
- Adapter compatibility with the selected SQL target must be proven in Builds 1 and 3.
- Split stores are reconsidered only after a measured scaling, availability, or security need.
