import assert from "node:assert/strict";
import test from "node:test";

import { runSpineDemo } from "../scripts/spine-demo.js";

test("the synthetic Coworker spine converges after every durable interruption", async () => {
  const receipt = await runSpineDemo();

  assert.equal(receipt.build, 2);
  assert.equal(receipt.scenario, "synthetic-coworker-spine");
  assert.equal(receipt.interruptionRuns.length, receipt.durableBoundaries.length);
  assert.ok(
    receipt.interruptionRuns.every((run) =>
      receipt.uncertainBoundaries.includes(run.boundary)
        ? run.deliveryStatus === "uncertain" &&
          run.providerAttempts <= 1 &&
          run.pendingDeliveryAttention === 1
        : run.matchesBaseline,
    ),
  );
  assert.deepEqual(receipt.outcome, {
    archiveEvents: 1,
    attestations: 1,
    beliefs: 1,
    attentionItems: 1,
    settledAttentionItems: 1,
    brainBatches: 1,
    brainBatchMembers: 1,
    effects: 1,
    completedEffects: 1,
    surfaceDeliveries: 1,
    sentSurfaceDeliveries: 1,
    failedSurfaceDeliveries: 0,
    uncertainSurfaceDeliveries: 0,
    providerDeliveries: 1,
    duplicateProviderDeliveries: 0,
  });
  assert.equal(receipt.evals.E0.passed, true);
  assert.equal(receipt.evals.E1.passed, true);
  assert.equal(receipt.evals.E2.passed, true);
  assert.equal(receipt.identities.providerEvidenceId, `synthetic:${receipt.identities.effectId}`);
});
