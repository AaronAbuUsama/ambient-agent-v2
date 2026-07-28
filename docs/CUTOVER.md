# Production cutover

## Goal

Replace the existing Ambient Agent implementation with this repository in one controlled
operational cutover while preserving a bounded rollback path.

No cutover is scheduled until Build 5 and its staging rehearsal pass.

## Coexistence

Until cutover:

- `ambient-agent` remains the production repository and service;
- `ambient-agent-v2` remains the replacement development repository;
- replacement staging uses isolated service, data, ports, secrets, provider identities, and
  webhook ingress;
- donor code is ported narrowly with its new owner and proof;
- neither repository claims the other's runtime evidence.

## State inventory

Before rehearsal, classify every production asset:

| Asset | Default treatment |
|---|---|
| GitHub repository URL, issues, and references | preserve existing repository identity |
| replacement Git history | retain through unrelated-history merge |
| GitHub App registrations/installations | reuse only after permission and callback audit |
| GitHub App keys/webhook secrets | reprovision through production secret custody |
| WhatsApp account | explicitly re-pair unless session migration is proven |
| Conversation Archive | import only through a validated, idempotent importer |
| Graph/attention/effects/work | clean start unless semantic migration is explicitly proven |
| old databases and credentials | immutable backup through rollback window |
| DNS/webhook ingress | switch only after replacement health is ready |

This table is a default, not proof that any migration exists.

## Repository replacement

Preserve the existing `ambient-agent` GitHub repository identity so its issues, PR links, and
external references remain stable.

At the rehearsed cutover:

1. create a replacement branch from the old repository's current `main`;
2. merge the proven `ambient-agent-v2/main` history with unrelated histories allowed;
3. resolve the tree to exactly the replacement repository plus any explicitly retained
   repository metadata;
4. run all replacement checks on the resulting merge commit;
5. open one ready-for-review atomic PR into the old `main`;
6. merge only after the production checklist and rollback owner are present.

The exact commands are written and dry-run during Build 5 against disposable clones.

## Operational rehearsal

The staging rehearsal must demonstrate:

- backup and restore of the tenant database;
- clean deployment from an immutable commit;
- external credential provisioning without repository secrets;
- WhatsApp pairing and GitHub webhook rotation;
- old-service stop and replacement start;
- health, recovery, external effects, and negative assertions;
- rollback to the old artifact and database.

## Production sequence

1. Announce and bound the outward-effect freeze.
2. Record old repository, service, artifact, database, and credential fingerprints.
3. Stop admissions and let accepted effects settle or record them as unresolved.
4. Stop the old service.
5. Take final immutable backups.
6. Provision the replacement database and production secrets.
7. Start the replacement without opening ingress.
8. Verify health, database ownership, and stable application configuration.
9. Pair/reconnect WhatsApp and switch GitHub webhook ingress.
10. Run one authorized production proof per external boundary.
11. Open ordinary admissions.
12. Record the production receipt and start the rollback window.

## Abort conditions

Abort and restore the old runtime if:

- database integrity or ownership checks fail;
- an admitted input or effect has ambiguous identity;
- WhatsApp or GitHub produces an unexplained duplicate or uncertain effect;
- unauthorized Surface/repository access is observed;
- the replacement cannot produce required proof receipts;
- rollback inputs are incomplete.

## Completion

Cutover is complete only when:

- the replacement is the only live production service;
- required P0–P6 proofs are recorded;
- unresolved old work is explicitly reconciled;
- the old service is disabled but recoverable for the agreed window;
- the old implementation is archived after that window;
- `STATUS.md` names the production commit and evidence.
