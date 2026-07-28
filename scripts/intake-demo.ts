import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { createCoworker } from "@ambient-agent/coworker";
import type { SurfaceDeliveryPort } from "@ambient-agent/coworker";
import { syntheticReasoner } from "@ambient-agent/coworker/proof";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

class SyntheticSurface implements SurfaceDeliveryPort {
  deliveries = 0;

  async deliver(effect: Parameters<SurfaceDeliveryPort["deliver"]>[0]) {
    this.deliveries += 1;
    return { providerEvidence: `synthetic:${effect.id}` };
  }
}

export async function runIntakeDemo() {
  const startedAt = new Date();
  const artifactDirectory = resolve(
    repositoryRoot,
    "receipts",
    "build-3-1",
    startedAt.toISOString().replaceAll(":", "-"),
  );
  const databasePath = resolve(artifactDirectory, "tenant.sqlite");
  const receiptPath = resolve(artifactDirectory, "receipt.json");
  await mkdir(artifactDirectory, { recursive: true });

  const surface = new SyntheticSurface();
  const coworker = createCoworker({
    databasePath,
    reasoner: syntheticReasoner,
    surface,
  });
  const bindingSource = {
    provider: "synthetic",
    providerAccountId: "account_build_3_1",
    providerConversationId: "authorized_conversation",
  };
  const binding = coworker.bindSurface(bindingSource);
  const admittedInput = {
    ...bindingSource,
    providerMessageId: "authorized_message",
    kind: "arrival" as const,
    direction: "inbound" as const,
    occurredAt: 1_785_235_208_000,
    text: "Remember the deployment window.",
  };
  const unauthorizedInput = {
    provider: "synthetic",
    providerAccountId: "account_build_3_1",
    providerConversationId: "unauthorized_conversation",
    providerMessageId: "unauthorized_message",
    kind: "arrival" as const,
    direction: "inbound" as const,
    occurredAt: 1_785_235_209_000,
    text: "Archive this without admitting it.",
    contentType: "image" as const,
    media: {
      mimetype: "image/jpeg",
      byteLength: 24,
      rawEnvelope: Buffer.from("raw-provider-envelope"),
    } as { mimetype: string; byteLength: number },
  };
  const providerReceiptInput = {
    ...bindingSource,
    providerMessageId: "provider_receipt",
    kind: "receipt" as const,
    direction: "outbound" as const,
    occurredAt: 1_785_235_210_000,
    status: "read" as const,
  };

  const admitted = coworker.observeConversationEvent(admittedInput);
  const replay = coworker.observeConversationEvent(admittedInput);
  const unauthorized = coworker.observeConversationEvent(unauthorizedInput);
  const providerReceipt = coworker.observeConversationEvent(providerReceiptInput);
  assert.equal(admitted.outcome, "admitted");
  assert.deepEqual(replay, admitted);
  assert.equal(unauthorized.outcome, "archived");
  assert.equal(providerReceipt.outcome, "archived");
  assert.equal(surface.deliveries, 0);

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const counts = {
    archiveEvents: Number(
      (database.prepare("SELECT count(*) AS count FROM archive_events").get() as { count: number })
        .count,
    ),
    attentionItems: Number(
      (
        database.prepare("SELECT count(*) AS count FROM attention_items").get() as {
          count: number;
        }
      ).count,
    ),
    surfaces: Number(
      (database.prepare("SELECT count(*) AS count FROM surfaces").get() as { count: number }).count,
    ),
    surfaceBindings: Number(
      (
        database.prepare("SELECT count(*) AS count FROM surface_bindings").get() as {
          count: number;
        }
      ).count,
    ),
    deliveries: surface.deliveries,
  };
  const attentionSources = database
    .prepare("SELECT source_event_id FROM attention_items ORDER BY source_event_id")
    .all() as unknown as { source_event_id: string }[];
  const attentionWithoutArchive = Number(
    (
      database
        .prepare(
          `SELECT count(*) AS count
             FROM attention_items AS attention
             LEFT JOIN archive_events AS archive ON archive.id = attention.source_event_id
            WHERE archive.id IS NULL`,
        )
        .get() as { count: number }
    ).count,
  );
  database.close();
  assert.deepEqual(counts, {
    archiveEvents: 3,
    attentionItems: 1,
    surfaces: 1,
    surfaceBindings: 1,
    deliveries: 0,
  });
  const onlyAuthorizedArrivalAdmitted =
    attentionSources.length === 1 && attentionSources[0].source_event_id === admitted.eventId;
  assert.equal(onlyAuthorizedArrivalAdmitted, true);
  assert.equal(attentionWithoutArchive, 0);

  const databaseBytes = await readFile(databasePath);
  const noRawProviderEnvelope = !databaseBytes.includes(Buffer.from("raw-provider-envelope"));
  assert.equal(noRawProviderEnvelope, true);
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  const workingTreeDirty =
    spawnSync("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).stdout.trim().length > 0;
  const receipt = {
    repository: "https://github.com/AaronAbuUsama/ambient-agent-v2",
    commit,
    workingTreeDirty,
    build: "3.1",
    scenario: "conversation-intake-and-surface-binding",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    environment: "local",
    commands: ["pnpm demo:intake"],
    configurationFingerprint: createHash("sha256")
      .update("node|sqlite|synthetic|normalized-intake-v1")
      .digest("hex"),
    inputs: {
      admittedProviderMessageId: admittedInput.providerMessageId,
      replayedProviderMessageId: admittedInput.providerMessageId,
      unauthorizedProviderMessageId: unauthorizedInput.providerMessageId,
      providerReceiptMessageId: providerReceiptInput.providerMessageId,
    },
    expectedOutcome: counts,
    identities: {
      surfaceId: binding.surfaceId,
      admittedEventId: admitted.eventId,
      unauthorizedEventId: unauthorized.eventId,
      providerReceiptEventId: providerReceipt.eventId,
      attentionId: admitted.outcome === "admitted" ? admitted.attentionId : null,
    },
    outcome: counts,
    artifacts: {
      database: relative(repositoryRoot, databasePath),
      databaseSha256: createHash("sha256").update(databaseBytes).digest("hex"),
      receipt: relative(repositoryRoot, receiptPath),
    },
    assertions: {
      admittedAttentionHasArchivedSource: attentionWithoutArchive === 0,
      replayPreservesIdentity: JSON.stringify(replay) === JSON.stringify(admitted),
      onlyAuthorizedArrivalAdmitted,
      noReasoningOrDeliveryDuringIntake: surface.deliveries === 0,
      noRawProviderEnvelope,
    },
    negativeAssertions: {
      noUnauthorizedAttention: unauthorized.outcome === "archived",
      noReceiptAttention: providerReceipt.outcome === "archived",
      noDeliveryDuringIntake: surface.deliveries === 0,
      noRawProviderEnvelope,
    },
    notProven: [
      "real WhatsApp normalization or delivery",
      "downstream reasoning from this normalized intake receipt",
      "uncertain external delivery recovery",
      "WhatsApp session persistence",
      "staging restart or soak",
      "human acceptance",
    ],
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runIntakeDemo(), null, 2)}\n`);
}
