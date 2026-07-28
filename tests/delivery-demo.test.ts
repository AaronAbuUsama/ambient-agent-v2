import assert from "node:assert/strict";
import test from "node:test";

import { runDeliveryDemo } from "../scripts/delivery-demo.js";

test("Build 3.2 proves safe Surface delivery outcomes and restart handling", async () => {
  const receipt = await runDeliveryDemo();

  assert.equal(receipt.build, "3.2");
  assert.equal(receipt.scenario, "safe-surface-delivery");
  assert.ok(Object.values(receipt.assertions).every(Boolean));
  assert.ok(Object.values(receipt.negativeAssertions).every(Boolean));
});
