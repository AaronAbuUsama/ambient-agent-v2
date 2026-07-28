import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBraintrustRows,
  runBenchmark,
  runCase,
  runDeterministicEvals,
} from "../evals/src/runner.mjs";

test("every eval shape preserves common evidence for local and Braintrust reports", async () => {
  const E0 = await runCase("reject-empty-evidence");
  assert.equal(E0.passed, true);
  assert.equal(E0.output.outcome, "reject-invalid-observation");

  const [singleRow] = normalizeBraintrustRows(E0);
  assert.deepEqual(singleRow.input.sourceObservation, E0.input);
  assert.deepEqual(singleRow.input.expected, E0.expected);
  assert.equal(singleRow.metadata.durationMs, E0.durationMs);

  const suiteRows = normalizeBraintrustRows(await runDeterministicEvals());
  assert.deepEqual(suiteRows.map((row) => row.input.dataset), [
    "generated-invariants",
    "synthetic-conversation",
    "brain-curated",
  ]);

  const benchmarkRows = normalizeBraintrustRows(await runBenchmark());
  assert.ok(benchmarkRows.every((row) => row.input.sourceObservation && row.output));
});
