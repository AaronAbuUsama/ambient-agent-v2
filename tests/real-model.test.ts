import assert from "node:assert/strict";
import test from "node:test";

import { runRealModelDemo } from "../scripts/real-model-demo.js";

test(
  "one synthetic Conversation Event crosses real Scribe, Brain, and Speaker inference",
  { skip: process.env.OPENCODE_GO_API_KEY === undefined, timeout: 180_000 },
  async () => {
    const receipt = await runRealModelDemo();

    assert.equal(receipt.proof.realModelInference, true);
    assert.equal(receipt.proof.noInternalMetadataLeak, true);
    assert.deepEqual(
      receipt.modelCalls.map(({ role }) => role),
      ["scribe", "brain", "speaker"],
    );
    assert.ok(receipt.modelCalls.every(({ responseId, tokens }) => responseId && tokens > 0));
    assert.equal(receipt.outcome.providerDeliveries, 1);
    assert.equal(receipt.outcome.duplicateProviderDeliveries, 0);
  },
);
