import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createCoworker } from "@ambient-agent/coworker";
import type { SurfaceDeliveryResult } from "@ambient-agent/coworker";
import {
  normalizeConversationEvent,
  runCoworkerSpine,
  syntheticReasoner,
} from "@ambient-agent/coworker/proof";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readOutcome(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  const delivery = database
    .prepare(
      `SELECT id, effect_id, status, provider_evidence, detail
         FROM surface_deliveries`,
    )
    .get();
  const pendingDeliveryAttention = database
    .prepare(
      `SELECT count(*) AS count
         FROM attention_items
        WHERE status = 'pending' AND surface_delivery_id IS NOT NULL`,
    )
    .get() as { count: number };
  const integrity = database.prepare("PRAGMA integrity_check").get() as {
    integrity_check: string;
  };
  database.close();
  return {
    delivery: { ...delivery },
    pendingDeliveryAttention: Number(pendingDeliveryAttention.count),
    integrity: integrity.integrity_check,
  };
}

async function runProviderOutcome(
  databasePath: string,
  providerOutcome: SurfaceDeliveryResult | Error,
) {
  let providerCalls = 0;
  const coworker = createCoworker({
    databasePath,
    reasoner: syntheticReasoner,
    surface: {
      async deliver() {
        providerCalls += 1;
        if (providerOutcome instanceof Error) throw providerOutcome;
        return providerOutcome;
      },
    },
  });
  const source = {
    provider: "synthetic",
    providerAccountId: "account_delivery_demo",
    providerConversationId: `conversation_${providerOutcome instanceof Error ? "thrown" : providerOutcome.status}`,
  };
  coworker.bindSurface(source);
  const observation = coworker.observeConversationEvent({
    ...source,
    providerMessageId: "message_delivery_demo",
    kind: "arrival",
    direction: "inbound",
    occurredAt: 1_785_235_400_000,
    text: "Deliver this exactly once.",
  });
  await coworker.runUntilIdle();
  await coworker.runUntilIdle();
  return {
    sourceEventId: observation.eventId,
    providerCalls,
    ...readOutcome(databasePath),
  };
}

async function runInterruptedAttempt(databasePath: string) {
  let providerCalls = 0;
  let modelCalls = 0;
  const surface = {
    async deliver() {
      providerCalls += 1;
      return { status: "sent" as const, providerEvidence: "synthetic:unexpected" };
    },
  };
  const event = normalizeConversationEvent({
    id: `event_${createHash("sha256")
      .update("delivery-demo-restart")
      .digest("hex")
      .slice(0, 24)}`,
    surfaceId: "surface_delivery_demo_restart",
    text: "Do not retry this delivery blindly.",
  });
  await assert.rejects(
    runCoworkerSpine({
      databasePath,
      event,
      surface,
      interrupt(boundary) {
        if (boundary === "delivery-attempting") {
          throw new Error("synthetic process interruption");
        }
      },
    }),
    /synthetic process interruption/,
  );
  const unavailableReasoner = {
    ...syntheticReasoner,
    async scribe() {
      modelCalls += 1;
      throw new Error("model unavailable");
    },
    async brain() {
      modelCalls += 1;
      throw new Error("model unavailable");
    },
    async speaker() {
      modelCalls += 1;
      throw new Error("model unavailable");
    },
  };
  await runCoworkerSpine({ databasePath, event, surface, reasoner: unavailableReasoner });
  await runCoworkerSpine({ databasePath, event, surface, reasoner: unavailableReasoner });
  return {
    sourceEventId: event.id,
    interruptionPoint: "delivery-attempting" as const,
    providerCalls,
    modelCalls,
    ...readOutcome(databasePath),
  };
}

async function sourceFingerprint() {
  const digest = createHash("sha256");
  const dist = resolve(repositoryRoot, "packages/coworker/dist");
  const paths = (await readdir(dist, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(repositoryRoot, resolve(entry.parentPath, entry.name)))
    .concat("scripts/delivery-demo.ts")
    .sort();
  for (const path of paths) {
    digest.update(path);
    digest.update(await readFile(resolve(repositoryRoot, path)));
  }
  return digest.digest("hex");
}

export async function runDeliveryDemo() {
  const startedAt = new Date();
  const artifactDirectory = resolve(
    repositoryRoot,
    "receipts",
    "build-3-2",
    startedAt.toISOString().replaceAll(":", "-"),
  );
  await mkdir(artifactDirectory, { recursive: true });
  const databasePaths = {
    sent: resolve(artifactDirectory, "sent.sqlite"),
    failed: resolve(artifactDirectory, "failed.sqlite"),
    uncertain: resolve(artifactDirectory, "uncertain.sqlite"),
    interrupted: resolve(artifactDirectory, "interrupted.sqlite"),
  };
  const scenarios = {
    sent: await runProviderOutcome(databasePaths.sent, {
      status: "sent",
      providerEvidence: "synthetic:accepted",
    }),
    failed: await runProviderOutcome(databasePaths.failed, {
      status: "failed",
      detail: "synthetic provider rejection",
    }),
    uncertain: await runProviderOutcome(
      databasePaths.uncertain,
      new Error("synthetic connection loss"),
    ),
    interrupted: await runInterruptedAttempt(databasePaths.interrupted),
  };
  const expected = {
    sent: { status: "sent", providerCalls: 1, pendingDeliveryAttention: 0 },
    failed: { status: "failed", providerCalls: 1, pendingDeliveryAttention: 1 },
    uncertain: { status: "uncertain", providerCalls: 1, pendingDeliveryAttention: 1 },
    interrupted: { status: "uncertain", providerCalls: 0, pendingDeliveryAttention: 1 },
  };
  for (const [name, outcome] of Object.entries(scenarios)) {
    const expectation = expected[name as keyof typeof expected];
    assert.equal(outcome.delivery.status, expectation.status);
    assert.equal(outcome.providerCalls, expectation.providerCalls);
    assert.equal(outcome.pendingDeliveryAttention, expectation.pendingDeliveryAttention);
    assert.equal(outcome.integrity, "ok");
  }

  const receiptPath = resolve(artifactDirectory, "receipt.json");
  const receipt = {
    repository: "https://github.com/AaronAbuUsama/ambient-agent-v2",
    commit: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).stdout.trim(),
    workingTreeDirty:
      spawnSync("git", ["status", "--porcelain"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).stdout.trim().length > 0,
    executedSourceSha256: await sourceFingerprint(),
    build: "3.2",
    scenario: "safe-surface-delivery",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    environment: "local",
    commands: ["pnpm demo:delivery"],
    configurationFingerprint: createHash("sha256")
      .update(JSON.stringify({ database: "node:sqlite", provider: "synthetic" }))
      .digest("hex"),
    expected,
    inputs: Object.fromEntries(
      Object.entries(scenarios).map(([name, scenario]) => [
        name,
        { sourceEventId: scenario.sourceEventId },
      ]),
    ),
    interruption: {
      scenario: "interrupted",
      point: scenarios.interrupted.interruptionPoint,
    },
    scenarios,
    artifacts: {
      receipt: relative(repositoryRoot, receiptPath),
      databases: Object.fromEntries(
        await Promise.all(
          Object.entries(databasePaths).map(async ([name, path]) => [
            name,
            {
              path: relative(repositoryRoot, path),
              sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
            },
          ]),
        ),
      ),
    },
    assertions: {
      sentHasProviderEvidence:
        scenarios.sent.delivery.provider_evidence === "synthetic:accepted",
      failedCreatesAttention: scenarios.failed.pendingDeliveryAttention === 1,
      uncertainCreatesAttention: scenarios.uncertain.pendingDeliveryAttention === 1,
      interruptedAttemptNotRetried: scenarios.interrupted.providerCalls === 0,
      interruptedRecoveryDoesNotNeedModel: scenarios.interrupted.modelCalls === 0,
      everyScenarioHasStableSourceIdentity: Object.values(scenarios).every(
        ({ sourceEventId }) => /^event_[a-f0-9]{24}$/.test(sourceEventId),
      ),
      exactInterruptionPoint:
        scenarios.interrupted.interruptionPoint === "delivery-attempting",
      everyDatabaseIntegrityCheckPassed: Object.values(scenarios).every(
        ({ integrity }) => integrity === "ok",
      ),
    },
    negativeAssertions: {
      noBlindRetryAfterIndeterminateCall: scenarios.uncertain.providerCalls === 1,
      noBlindRetryAfterInterruptedAttempt: scenarios.interrupted.providerCalls === 0,
      noFailureAttentionForSentDelivery: scenarios.sent.pendingDeliveryAttention === 0,
    },
    notProven: [
      "real WhatsApp delivery or provider acknowledgement",
      "provider-side reconciliation of an uncertain delivery",
      "process termination during a real provider call",
      "hosted restart or soak",
      "human acceptance",
    ],
  };
  assert.ok(Object.values(receipt.assertions).every(Boolean));
  assert.ok(Object.values(receipt.negativeAssertions).every(Boolean));
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runDeliveryDemo(), null, 2)}\n`);
}
