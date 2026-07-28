# ADR 0001: Build in a clean replacement repository

Status: accepted, 2026-07-28.

## Context

The existing repository contains validated behavior alongside abandoned pivots, mixed runtime
ownership, and architecture-specific tests that no longer describe the intended system.
Incremental cleanup would make every new boundary depend on distinguishing donor code from
accidental structure.

## Decision

Build the replacement in `ambient-agent-v2`. Treat the old repository as a quarry of lessons,
fixtures, and narrow donor implementations. Port behavior only when an active build owns and
proves it.

## Consequences

- Each build begins from explicit ownership.
- The old service remains operational during construction.
- Production replacement requires an atomic unrelated-history cutover.
- Bulk code copying and placeholder compatibility layers are prohibited.
