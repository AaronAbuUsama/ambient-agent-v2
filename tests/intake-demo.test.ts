import assert from "node:assert/strict";
import test from "node:test";

import { runIntakeDemo } from "../scripts/intake-demo.js";

test("Build 3.1 proves normalized Conversation Intake and Surface Binding", async () => {
  const receipt = await runIntakeDemo();
  assert.equal(receipt.assertions.onlyAuthorizedArrivalAdmitted, true);
  assert.equal(receipt.assertions.replayPreservesIdentity, true);
  assert.equal(receipt.assertions.everyArchiveOnlyClassDurablyRecorded, true);
  assert.equal(receipt.assertions.noReasoningOrDeliveryDuringIntake, true);
  assert.equal(receipt.assertions.noRawProviderEnvelope, true);
});
