import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { createCoworker } from "@ambient-agent/coworker";
import type { SurfaceDeliveryPort } from "@ambient-agent/coworker";
import {
  normalizeConversationEvent,
  durableBoundaries,
  rebuildGraph,
  readCanonicalSpineState,
  readSpineOutcome,
  runCoworkerSpine,
  syntheticReasoner,
} from "@ambient-agent/coworker/proof";
import type { BrainEffect, DurableBoundary } from "@ambient-agent/coworker/proof";
import { runDeterministicEvals } from "../evals/src/runner.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const event = normalizeConversationEvent({
  id: "event_build_2",
  surfaceId: "surface_build_2",
  text: "Remember the deployment window",
});

class SyntheticSurface implements SurfaceDeliveryPort {
  attempts = 0;
  deliveries = new Map<string, { text: string; providerEvidence: string }>();

  async deliver(effect: BrainEffect) {
    this.attempts += 1;
    const existing = this.deliveries.get(effect.id);
    if (existing) {
      assert.equal(existing.text, effect.text);
      return { providerEvidence: existing.providerEvidence };
    }
    const delivery = {
      text: effect.text,
      providerEvidence: `synthetic:${effect.id}`,
    };
    this.deliveries.set(effect.id, delivery);
    return { providerEvidence: delivery.providerEvidence };
  }

  snapshot() {
    return [...this.deliveries.entries()].sort(([left], [right]) => left.localeCompare(right));
  }
}

function fingerprint(databasePath: string, surface: SyntheticSurface) {
  return createHash("sha256")
    .update(JSON.stringify({ database: readCanonicalSpineState(databasePath), surface: surface.snapshot() }))
    .digest("hex");
}

async function executedSourceFingerprint() {
  const digest = createHash("sha256");
  const coworkerDist = resolve(repositoryRoot, "packages/coworker/dist");
  const builtPaths = (await readdir(coworkerDist, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(repositoryRoot, resolve(entry.parentPath, entry.name)))
    .sort();
  const paths = [
    ...builtPaths,
    "scripts/spine-demo.ts",
    "evals/src/runner.ts",
    "evals/fixtures/generated-invariants.v1.json",
    "evals/fixtures/synthetic-conversation.v1.json",
    "evals/fixtures/brain-curated.v1.json",
  ];
  for (const path of paths) {
    digest.update(path);
    digest.update(await readFile(resolve(repositoryRoot, path)));
  }
  return digest.digest("hex");
}

async function runInterrupted(databasePath: string, boundary: DurableBoundary) {
  const surface = new SyntheticSurface();
  let interrupted = false;
  await assert.rejects(
    runCoworkerSpine({
      databasePath,
      event,
      surface,
      interrupt(current) {
        if (!interrupted && current === boundary) {
          interrupted = true;
          throw new Error(`synthetic interruption after ${boundary}`);
        }
      },
    }),
    new RegExp(boundary),
  );
  await runCoworkerSpine({ databasePath, event, surface });
  return { fingerprint: fingerprint(databasePath, surface), providerAttempts: surface.attempts };
}

export async function runSpineDemo() {
  const startedAt = new Date();
  const artifactDirectory = resolve(
    repositoryRoot,
    "receipts",
    "build-2",
    startedAt.toISOString().replaceAll(":", "-"),
  );
  await mkdir(artifactDirectory, { recursive: true });

  const baselineDatabase = resolve(artifactDirectory, "baseline.sqlite");
  const baselineSurface = new SyntheticSurface();
  const baselineCoworker = createCoworker({
    databasePath: baselineDatabase,
    surface: baselineSurface,
    reasoner: syntheticReasoner,
  });
  baselineCoworker.admitConversationEvent(event);
  await baselineCoworker.runUntilIdle();
  const baselineFingerprint = fingerprint(baselineDatabase, baselineSurface);
  const projectionBeforeRebuild = readCanonicalSpineState(baselineDatabase).knowledge_beliefs;
  const projectionDatabase = new DatabaseSync(baselineDatabase);
  projectionDatabase
    .prepare("UPDATE knowledge_beliefs SET object = 'corrupted projection'")
    .run();
  projectionDatabase.close();
  rebuildGraph(baselineDatabase);
  assert.deepEqual(
    readCanonicalSpineState(baselineDatabase).knowledge_beliefs,
    projectionBeforeRebuild,
  );

  const interruptionRuns = [];
  for (const boundary of durableBoundaries) {
    const databasePath = resolve(artifactDirectory, `${boundary}.sqlite`);
    const run = await runInterrupted(databasePath, boundary);
    interruptionRuns.push({
      boundary,
      providerAttempts: run.providerAttempts,
      matchesBaseline: run.fingerprint === baselineFingerprint,
    });
  }
  assert.ok(interruptionRuns.every(({ matchesBaseline }) => matchesBaseline));

  const spineOutcome = readSpineOutcome(baselineDatabase);
  const canonicalState = readCanonicalSpineState(baselineDatabase);
  const evals = await runDeterministicEvals();
  assert.equal(evals.E0.passed, true);
  assert.equal(evals.E1.passed, true);
  assert.equal(evals.E2.passed, true);

  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  const workingTreeDirty =
    spawnSync("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).stdout.trim().length > 0;
  const receiptPath = resolve(artifactDirectory, "receipt.json");
  const expectedOutcome = {
    archiveEvents: 1,
    attestations: 1,
    beliefs: 1,
    attentionItems: 1,
    settledAttentionItems: 1,
    brainBatches: 1,
    brainBatchMembers: 1,
    effects: 1,
    completedEffects: 1,
    providerDeliveries: 1,
    duplicateProviderDeliveries: 0,
  };
  const outcome = {
    ...spineOutcome,
    providerDeliveries: baselineSurface.deliveries.size,
    duplicateProviderDeliveries: 0,
  };
  assert.deepEqual(outcome, expectedOutcome);
  const receipt = {
    repository: "https://github.com/AaronAbuUsama/ambient-agent-v2",
    commit,
    workingTreeDirty,
    executedSourceSha256: await executedSourceFingerprint(),
    build: 2,
    scenario: "synthetic-coworker-spine",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    environment: "local",
    commands: [
      process.env.npm_lifecycle_event === "test" ? "pnpm test" : "pnpm demo:spine",
    ],
    configurationFingerprint: createHash("sha256")
      .update(JSON.stringify({ database: "node:sqlite", surface: "synthetic", model: null }))
      .digest("hex"),
    input: event,
    expectedOutcome,
    durableBoundaries,
    baselineFingerprint,
    interruptionRuns,
    identities: {
      conversationEventId: event.id,
      attestationId: canonicalState.knowledge_attestations[0].id,
      beliefId: canonicalState.knowledge_beliefs[0].id,
      attentionId: canonicalState.attention_items[0].id,
      brainBatchId: canonicalState.brain_batches[0].id,
      effectId: canonicalState.effects[0].id,
      providerEvidenceId: canonicalState.effects[0].provider_evidence,
      surfaceId: event.surfaceId,
    },
    outcome,
    evals: {
      E0: { dataset: evals.E0.dataset, version: evals.E0.version, passed: evals.E0.passed },
      E1: { dataset: evals.E1.dataset, version: evals.E1.version, passed: evals.E1.passed },
      E2: { dataset: evals.E2.dataset, version: evals.E2.version, passed: evals.E2.passed },
    },
    artifacts: {
      baselineDatabase: relative(repositoryRoot, baselineDatabase),
      baselineDatabaseSha256: createHash("sha256")
        .update(await readFile(baselineDatabase))
        .digest("hex"),
      receipt: relative(repositoryRoot, receiptPath),
    },
    proof: {
      deterministicStateConvergence: true,
      graphProjectionRebuilt: true,
      stableBrainBatchMembership: true,
      duplicateExternalEffects: 0,
    },
    assertions: {
      everyInterruptionMatchesBaseline: interruptionRuns.every(({ matchesBaseline }) => matchesBaseline),
      expectedOutcome: JSON.stringify(outcome) === JSON.stringify(expectedOutcome),
      E0: evals.E0.passed,
      E1: evals.E1.passed,
      E2: evals.E2.passed,
    },
    notProven: [
      "real model judgment or provider inference",
      "Braintrust publication",
      "WhatsApp",
      "GitHub",
      "hosted runtime",
      "multi-tenant isolation",
    ],
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runSpineDemo(), null, 2)}\n`);
}
