import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { createCoworker } from "@ambient-agent/coworker";
import type {
  ConversationEventInput,
  CoworkerReasoner,
  SurfaceDeliveryPort,
} from "@ambient-agent/coworker";
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
  let reasonerInvocations = 0;
  const reasoner: CoworkerReasoner = {
    attestationAuthor: syntheticReasoner.attestationAuthor,
    async scribe(event) {
      reasonerInvocations += 1;
      return syntheticReasoner.scribe(event);
    },
    async brain(input) {
      reasonerInvocations += 1;
      return syntheticReasoner.brain(input);
    },
    async speaker(input) {
      reasonerInvocations += 1;
      return syntheticReasoner.speaker(input);
    },
  };
  const coworker = createCoworker({
    databasePath,
    reasoner,
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
  const archiveOnlyInputs = {
    unauthorizedArrival: {
      provider: "synthetic",
      providerAccountId: "account_build_3_1",
      providerConversationId: "unauthorized_conversation",
      providerMessageId: "unauthorized_message",
      kind: "arrival",
      direction: "inbound",
      occurredAt: 1_785_235_209_000,
      text: "Archive this without admitting it.",
      contentType: "image",
      media: {
        mimetype: "image/jpeg",
        byteLength: 24,
        rawEnvelope: Buffer.from("raw-provider-envelope"),
      } as { mimetype: string; byteLength: number },
    },
    outboundArrival: {
      ...bindingSource,
      providerMessageId: "outbound_arrival",
      kind: "arrival",
      direction: "outbound",
      occurredAt: 1_785_235_210_000,
      text: "Archive the Coworker's outbound message.",
    },
    emptyInboundArrival: {
      ...bindingSource,
      providerMessageId: "empty_inbound_arrival",
      kind: "arrival",
      direction: "inbound",
      occurredAt: 1_785_235_211_000,
      text: " ",
    },
    edit: {
      ...bindingSource,
      providerMessageId: "edited_message",
      kind: "edit",
      direction: "inbound",
      occurredAt: 1_785_235_212_000,
      text: "Edited source evidence.",
    },
    revocation: {
      ...bindingSource,
      providerMessageId: "revoked_message",
      kind: "revocation",
      direction: "inbound",
      occurredAt: 1_785_235_213_000,
    },
    reaction: {
      ...bindingSource,
      providerMessageId: "reacted_message",
      kind: "reaction",
      direction: "inbound",
      occurredAt: 1_785_235_214_000,
      emoji: "👍",
      removed: false,
    },
    receipt: {
      ...bindingSource,
      providerMessageId: "provider_receipt",
      kind: "receipt",
      direction: "outbound",
      occurredAt: 1_785_235_215_000,
      status: "read",
    },
  } satisfies Record<string, ConversationEventInput>;

  const admitted = coworker.observeConversationEvent(admittedInput);
  const replay = coworker.observeConversationEvent(admittedInput);
  const archiveOnlyReceipts = Object.fromEntries(
    Object.entries(archiveOnlyInputs).map(([name, input]) => [
      name,
      coworker.observeConversationEvent(input),
    ]),
  ) as Record<
    keyof typeof archiveOnlyInputs,
    ReturnType<typeof coworker.observeConversationEvent>
  >;
  assert.equal(admitted.outcome, "admitted");
  assert.deepEqual(replay, admitted);
  assert.ok(Object.values(archiveOnlyReceipts).every(({ outcome }) => outcome === "archived"));
  assert.equal(reasonerInvocations, 0);
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
  const archivedEventIds = new Set(
    (
      database.prepare("SELECT id FROM archive_events ORDER BY id").all() as unknown as {
        id: string;
      }[]
    ).map(({ id }) => id),
  );
  database.close();
  assert.deepEqual(counts, {
    archiveEvents: 8,
    attentionItems: 1,
    surfaces: 1,
    surfaceBindings: 1,
    deliveries: 0,
  });
  const onlyAuthorizedArrivalAdmitted =
    attentionSources.length === 1 && attentionSources[0].source_event_id === admitted.eventId;
  const archiveOnlyDurablyRecorded = Object.fromEntries(
    Object.entries(archiveOnlyReceipts).map(([name, receipt]) => [
      name,
      receipt.outcome === "archived" && archivedEventIds.has(receipt.eventId),
    ]),
  ) as Record<keyof typeof archiveOnlyInputs, boolean>;
  assert.equal(onlyAuthorizedArrivalAdmitted, true);
  assert.ok(Object.values(archiveOnlyDurablyRecorded).every(Boolean));
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
      archiveOnlyProviderMessageIds: Object.fromEntries(
        Object.entries(archiveOnlyInputs).map(([name, input]) => [name, input.providerMessageId]),
      ),
    },
    expectedOutcome: counts,
    identities: {
      surfaceId: binding.surfaceId,
      admittedEventId: admitted.eventId,
      archiveOnlyEventIds: Object.fromEntries(
        Object.entries(archiveOnlyReceipts).map(([name, receipt]) => [name, receipt.eventId]),
      ),
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
      everyArchiveOnlyClassDurablyRecorded: Object.values(archiveOnlyDurablyRecorded).every(Boolean),
      noReasoningOrDeliveryDuringIntake:
        reasonerInvocations === 0 && surface.deliveries === 0,
      noRawProviderEnvelope,
    },
    negativeAssertions: {
      unauthorizedArrivalArchivedWithoutAttention: archiveOnlyDurablyRecorded.unauthorizedArrival,
      outboundArrivalArchivedWithoutAttention: archiveOnlyDurablyRecorded.outboundArrival,
      emptyInboundArrivalArchivedWithoutAttention:
        archiveOnlyDurablyRecorded.emptyInboundArrival,
      editArchivedWithoutAttention: archiveOnlyDurablyRecorded.edit,
      revocationArchivedWithoutAttention: archiveOnlyDurablyRecorded.revocation,
      reactionArchivedWithoutAttention: archiveOnlyDurablyRecorded.reaction,
      receiptArchivedWithoutAttention: archiveOnlyDurablyRecorded.receipt,
      noDeliveryDuringIntake: surface.deliveries === 0,
      noRawProviderEnvelope,
    },
    notProven: [
      "real WhatsApp normalization or delivery",
      "downstream reasoning from this normalized intake receipt",
      "process interruption or restart recovery of normalized intake",
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
