import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { BrainAgent, ScribeAgent, SpeakerAgent } from "@ambient-agent/agents/coworker";
import { createCoworker } from "@ambient-agent/coworker";
import type { SurfaceDeliveryPort } from "@ambient-agent/coworker";
import { readCanonicalSpineState, readSpineOutcome } from "@ambient-agent/coworker/proof";
import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { observe } from "@flue/runtime";
import { sqlite, start } from "@flue/runtime/node";

import { createFlueReasoner } from "./flue-reasoner.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const roles = ["scribe", "brain", "speaker"] as const;
type Role = (typeof roles)[number];

interface ModelCall {
  role: Role;
  providerId: string;
  requestedModel: string;
  api: string;
  responseId: string;
  responseIds: string[];
  responseModels: string[];
  tokens: number;
  costUsd: null;
  turns: number;
  durationMs: number;
  finishReasons: string[];
}

class SyntheticSurface implements SurfaceDeliveryPort {
  attempts = 0;
  deliveries = new Map<string, string>();

  async deliver(effect: Parameters<SurfaceDeliveryPort["deliver"]>[0]) {
    this.attempts += 1;
    const existing = this.deliveries.get(effect.id);
    if (existing) {
      assert.equal(existing, effect.text);
    } else {
      this.deliveries.set(effect.id, effect.text);
    }
    return { providerEvidence: `synthetic:${effect.id}` };
  }
}

function provider(apiKey: string) {
  return createProvider({
    id: "opencode-go",
    auth: {
      apiKey: {
        name: "OpenCode Go",
        resolve: async () => ({ auth: { apiKey } }),
      },
    },
    models: [
      {
        id: "glm-5.1",
        name: "GLM-5.1",
        api: "openai-completions",
        provider: "opencode-go",
        baseUrl: "https://opencode.ai/zen/go/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131_072,
        maxTokens: 4_096,
      },
    ],
    api: openAICompletionsApi(),
  });
}

async function sourceFingerprint() {
  const digest = createHash("sha256");
  const sourcePaths = [
    "apps/runtime/src/flue-reasoner.ts",
    "apps/runtime/src/real-model-demo.ts",
    "packages/agents/src/coworker.ts",
    "scripts/real-model-demo.ts",
  ];
  const coworkerDist = resolve(repositoryRoot, "packages/coworker/dist");
  const builtPaths = (await readdir(coworkerDist, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(repositoryRoot, resolve(entry.parentPath, entry.name)))
    .sort();
  for (const path of [...sourcePaths, ...builtPaths]) {
    digest.update(path);
    digest.update(await readFile(resolve(repositoryRoot, path)));
  }
  return digest.digest("hex");
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function runRealModelDemo() {
  const apiKey = process.env.OPENCODE_GO_API_KEY;
  if (!apiKey) {
    throw new Error("OPENCODE_GO_API_KEY is required");
  }

  const startedAt = new Date();
  const artifactDirectory = resolve(
    repositoryRoot,
    "receipts",
    "build-3a",
    startedAt.toISOString().replaceAll(":", "-"),
  );
  const databasePath = resolve(artifactDirectory, "tenant.sqlite");
  const receiptPath = resolve(artifactDirectory, "receipt.json");
  await mkdir(artifactDirectory, { recursive: true });

  const turns = new Map<Role, Omit<ModelCall, "responseId">>();
  const unsubscribe = observe((event, context) => {
    if (event.type !== "turn" || !roles.includes(context.agentName as Role)) return;
    const role = context.agentName as Role;
    const current = turns.get(role) ?? {
      role,
      providerId: event.request.providerId,
      requestedModel: event.request.requestedModel,
      api: event.request.api,
      responseIds: [],
      responseModels: [],
      tokens: 0,
      costUsd: null,
      turns: 0,
      durationMs: 0,
      finishReasons: [],
    };
    if (event.response.responseId) current.responseIds.push(event.response.responseId);
    if (event.response.responseModel) current.responseModels.push(event.response.responseModel);
    if (event.response.finishReason) current.finishReasons.push(event.response.finishReason);
    current.tokens += event.response.usage?.totalTokens ?? 0;
    current.turns += 1;
    current.durationMs += event.durationMs;
    turns.set(role, current);
  });

  const flue = await start({
    agents: [ScribeAgent, BrainAgent, SpeakerAgent],
    db: sqlite(databasePath),
    providers: [provider(apiKey)],
  });
  const surface = new SyntheticSurface();
  const reasoningOutputs: Partial<Record<Role, unknown>> = {};
  const input = {
    id: "event_build_3a_real_model",
    surfaceId: "surface_build_3a",
    text: "Please acknowledge that the deployment window is Tuesday at 15:00 UTC.",
  };

  try {
    const coworker = createCoworker({
      databasePath,
      surface,
      reasoner: createFlueReasoner((role, output) => {
        reasoningOutputs[role] = output;
      }),
    });
    coworker.admitConversationEvent(input);
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 1 });
  } finally {
    await flue.stop();
    unsubscribe();
  }

  const modelCalls = roles.map((role) => {
    const call = turns.get(role);
    assert.ok(call, `${role} model turn is missing`);
    const responseId = call.responseIds.at(-1);
    assert.ok(responseId, `${role} provider response ID is missing`);
    return { ...call, responseId };
  });
  assert.ok(
    modelCalls.every(
      ({ providerId, requestedModel, tokens }) =>
        providerId === "opencode-go" && requestedModel === "glm-5.1" && tokens > 0,
    ),
  );
  assert.deepEqual(Object.keys(reasoningOutputs).sort(), [...roles].sort());
  const speakerText = (reasoningOutputs.speaker as { text: string }).text;
  for (const forbidden of ["att_", "event_build_", "scribe", "confidence", "2026"]) {
    assert.equal(speakerText.toLowerCase().includes(forbidden.toLowerCase()), false);
  }

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.close();
  assert.equal(await exists(`${databasePath}-wal`), false);
  assert.equal(await exists(`${databasePath}-shm`), false);

  const spineOutcome = readSpineOutcome(databasePath);
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
    providerDeliveries: surface.deliveries.size,
    duplicateProviderDeliveries: surface.attempts - surface.deliveries.size,
  };
  assert.deepEqual(outcome, expectedOutcome);
  const canonicalState = readCanonicalSpineState(databasePath);

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
    build: "3A",
    scenario: "real-model-synthetic-coworker",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    environment: "local",
    commands: ["OPENCODE_GO_API_KEY=<redacted> pnpm demo:real-model"],
    configurationFingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          runtime: "node",
          database: "sqlite",
          provider: "opencode-go",
          model: "glm-5.1",
          surface: "synthetic",
        }),
      )
      .digest("hex"),
    input,
    expectedOutcome,
    modelCalls,
    reasoningOutputs,
    outcome,
    identities: {
      conversationEventId: input.id,
      attestationId: canonicalState.knowledge_attestations[0].id,
      attentionId: canonicalState.attention_items[0].id,
      brainBatchId: canonicalState.brain_batches[0].id,
      effectId: canonicalState.effects[0].id,
      providerEvidenceId: canonicalState.effects[0].provider_evidence,
      modelResponseIds: modelCalls.flatMap(({ responseIds }) => responseIds),
      surfaceId: input.surfaceId,
    },
    artifacts: {
      database: relative(repositoryRoot, databasePath),
      databaseSha256: createHash("sha256").update(await readFile(databasePath)).digest("hex"),
      executedSourceSha256: await sourceFingerprint(),
      receipt: relative(repositoryRoot, receiptPath),
    },
    proof: {
      realModelInference: true,
      realScribeInference: true,
      realBrainInference: true,
      realSpeakerInference: true,
      trustedApplicationValidation: true,
      noInternalMetadataLeak: true,
      duplicateExternalEffects: 0,
    },
    assertions: {
      threeRealModelRoles: modelCalls.length === 3,
      providerResponseIds: modelCalls.every(({ responseId }) => responseId.length > 0),
      nonZeroTokenUsage: modelCalls.every(({ tokens }) => tokens > 0),
      structuredRoleOutputs: Object.keys(reasoningOutputs).length === 3,
      expectedOutcome: JSON.stringify(outcome) === JSON.stringify(expectedOutcome),
    },
    negativeAssertions: {
      duplicateSurfaceDeliveries: outcome.duplicateProviderDeliveries === 0,
      internalMetadataLeak: false,
      credentialPersisted: false,
    },
    notProven: [
      "model-output replay across a process interruption",
      "Braintrust publication",
      "WhatsApp",
      "GitHub",
      "hosted runtime",
      "multi-tenant isolation",
    ],
  };
  const serializedReceipt = JSON.stringify(receipt, null, 2);
  assert.equal(serializedReceipt.includes(apiKey), false);
  await writeFile(receiptPath, `${serializedReceipt}\n`);
  return receipt;
}
