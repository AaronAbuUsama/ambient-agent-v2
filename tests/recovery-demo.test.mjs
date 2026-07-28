import assert from "node:assert/strict";
import test from "node:test";

import { runRecoveryDemo } from "../scripts/recovery-demo.mjs";

test("an admitted Flue agent prompt settles once after a forced Node restart", async () => {
  const receipt = await runRecoveryDemo();

  assert.equal(receipt.build, 1);
  assert.equal(receipt.instanceId, "build-1-proof");
  assert.equal(receipt.interruption.signal, "SIGKILL");
  assert.equal(receipt.restarts, 1);
  assert.equal(receipt.outcome.text, "RECOVERED_ONCE");
  assert.equal(receipt.outcome.terminalAssistantMessages, 1);
  assert.equal(receipt.outcome.duplicateTerminalMessages, 0);
  assert.equal(receipt.outcome.modelRequests, 2);
  assert.equal(receipt.proof.databaseSurvivedRestart, true);
  assert.equal(receipt.proof.sameSubmissionSettled, true);
  assert.equal(receipt.proof.unauthorizedInspectionRejected, true);
});
