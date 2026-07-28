# Proof contract

## Why

A passing test, a deployed process, and a behavior witnessed in WhatsApp prove different
things. Build completion requires naming those boundaries instead of flattening them into
“green.”

## Proof levels

| Level | Name | What it establishes |
|---|---|---|
| P0 | Static | source/configuration shape and dependency laws |
| P1 | Mechanical | checks pass in a clean, reproducible environment |
| P2 | Local runtime | the built artifact completes the scenario locally |
| P3 | Recovery | interruption/retry preserves identity and external-effect safety |
| P4 | External integration | the real provider boundary completed with provider evidence |
| P5 | Hosted operation | the deployed service survives restart/soak under its service manager |
| P6 | Human acceptance | an operator observed the intended product behavior |

A build's exit gate names the highest required level. A higher level never silently waives a
lower one.

## Required receipt fields

Every non-trivial runtime proof records:

- repository and commit;
- build number and scenario identifier;
- UTC start/end timestamps;
- environment (`local`, `staging`, or `production`);
- exact commands;
- non-secret configuration fingerprint;
- input identity and expected outcome;
- interruption or retry point when applicable;
- observed durable application identities;
- provider evidence identifiers when applicable;
- assertion results and negative assertions;
- artifact paths;
- human observer and observation when P6 applies;
- explicit unproven claims.

Receipts are generated artifacts and are not committed by default. A sanitized manifest may be
attached to the PR or stored in the selected evidence backend.

## Status language

- **Mechanically green:** required P0/P1 checks passed.
- **Runtime proven:** the required P2/P3 scenario passed.
- **Externally proven:** the required P4 provider boundary passed.
- **Hosted proven:** P5 passed against the deployed artifact.
- **Human accepted:** P6 was explicitly recorded.
- **Blocked:** a named dependency prevents the required proof.
- **Not proven:** everything else, including mocks and design documents.

## Negative assertions

Every scenario must state what must not happen. Core examples:

- no duplicate provider effect after retry;
- no event admitted before archival commit;
- no unauthorized Surface reaches a Speaker;
- no Scribe proposal becomes a Brain ruling implicitly;
- no cross-tenant data, credential, or work visibility;
- no success claim based only on a Flue-generated identifier.

## Stage boundary

A build advances only after:

1. its PR is merged;
2. its required proof levels pass on the merged commit;
3. `STATUS.md` is updated with exact evidence;
4. descendant builds still rest on true premises.
