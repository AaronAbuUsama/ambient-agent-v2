import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { decideEffect, extractAttestation } from "@ambient-agent/coworker";

const fixturePath = fileURLToPath(
  new URL("../fixtures/synthetic-conversation.v1.json", import.meta.url),
);
const curatedPath = fileURLToPath(new URL("../fixtures/brain-curated.v1.json", import.meta.url));

export async function listCases() {
  const datasets = await Promise.all(
    [fixturePath, curatedPath].map((path) => readFile(path, "utf8").then(JSON.parse)),
  );
  return datasets.flatMap((dataset) =>
    dataset.cases.map(({ id, provenance, tags }) => ({
      dataset: dataset.dataset,
      version: dataset.version,
      id,
      provenance,
      tags,
    })),
  );
}

function evaluateCase(testCase) {
  const attestation = extractAttestation(testCase.input);
  const effect = decideEffect(testCase.input, "batch_eval");
  const assertions = {
    claim: attestation.claim === testCase.expected.claim,
    evidence: attestation.evidenceQuote === testCase.expected.evidenceQuote,
    evidenceIdentity: attestation.evidenceEventId === testCase.input.id,
    effectType: effect.type === testCase.expected.effectType,
    effectText: effect.text === testCase.expected.effectText,
  };
  return {
    id: testCase.id,
    passed: Object.values(assertions).every(Boolean),
    assertions,
    output: { attestation, effect },
    expected: testCase.expected,
  };
}

function evaluateCuratedCase(testCase) {
  const effect = decideEffect(testCase.input, "batch_curated");
  const normalizedText = effect.text.toLowerCase();
  const rubric = {
    allowedEffect: testCase.acceptable.effectTypes.includes(effect.type),
    correctSurface: effect.surfaceId === testCase.acceptable.targetSurfaceId,
    requiredMeaning: testCase.acceptable.requiredMeaning.every((term) =>
      normalizedText.includes(term),
    ),
    forbiddenEffect: !testCase.forbidden.effectTypes.includes(effect.type),
  };
  return {
    id: testCase.id,
    passed: Object.values(rubric).every(Boolean),
    rubric,
    output: effect,
  };
}

export async function runCase(caseId) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const recordedCase = fixture.cases.find(({ id }) => id === caseId);
  if (recordedCase) return evaluateCase(recordedCase);
  const curated = JSON.parse(await readFile(curatedPath, "utf8"));
  const curatedCase = curated.cases.find(({ id }) => id === caseId);
  if (curatedCase) return evaluateCuratedCase(curatedCase);
  throw new Error(`Unknown eval case: ${caseId}`);
}

export async function runDeterministicEvals() {
  assert.throws(
    () => extractAttestation({ id: "event_empty", surfaceId: "surface_eval", text: " " }),
    /required/,
  );
  const E0 = {
    dataset: "generated-invariants",
    version: "1.0.0",
    passed: true,
    cases: 1,
  };

  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const results = fixture.cases.map(evaluateCase);
  const E1 = {
    dataset: fixture.dataset,
    version: fixture.version,
    passed: results.every(({ passed }) => passed),
    cases: results.length,
    results,
  };

  const curated = JSON.parse(await readFile(curatedPath, "utf8"));
  const curatedResults = curated.cases.map(evaluateCuratedCase);
  const E2 = {
    dataset: curated.dataset,
    version: curated.version,
    passed: curatedResults.every(({ passed }) => passed),
    cases: curatedResults.length,
    results: curatedResults,
  };
  return { E0, E1, E2 };
}

export async function runBenchmark(candidateIds = ["application/deterministic"]) {
  const evals = await runDeterministicEvals();
  return {
    datasetVersion: `${evals.E1.dataset}@${evals.E1.version}`,
    repetitions: 1,
    candidates: candidateIds.map((candidateId) => ({
      candidateId,
      deterministicPassRate: evals.E0.passed && evals.E1.passed && evals.E2.passed ? 1 : 0,
      cases: evals.E0.cases + evals.E1.cases + evals.E2.cases,
    })),
    modelInferenceProven: false,
  };
}

export async function publishToBraintrust(report) {
  if (!process.env.BRAINTRUST_API_KEY) {
    return { published: false, reason: "BRAINTRUST_API_KEY is not set" };
  }
  const { init } = await import("braintrust");
  const experiment = init("Ambient Agent v2", {
    apiKey: process.env.BRAINTRUST_API_KEY,
    experiment: `build-2-${Date.now()}`,
    metadata: { datasetVersion: report.E1.version, tier: "E0/E1/E2" },
  });
  for (const result of report.E1.results) {
    experiment.log({
      input: { caseId: result.id },
      output: result.output,
      expected: result.expected,
      scores: Object.fromEntries(
        Object.entries(result.assertions).map(([name, passed]) => [name, passed ? 1 : 0]),
      ),
    });
  }
  await experiment.flush();
  return { published: true };
}

async function main() {
  const [command = "deterministic", argument] = process.argv.slice(2);
  let report;
  if (command === "list") report = await listCases();
  else if (command === "run") report = await runCase(argument);
  else if (command === "benchmark") report = await runBenchmark(argument?.split(","));
  else if (command === "deterministic") report = await runDeterministicEvals();
  else throw new Error(`Unknown eval command: ${command}`);

  if (report.E0 && ![report.E0, report.E1, report.E2].every(({ passed }) => passed)) {
    throw new Error("Deterministic eval gate failed");
  }
  if (process.env.EVAL_REPORT_PATH) {
    await writeFile(process.env.EVAL_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (process.env.BRAINTRUST_PUBLISH === "1") {
    report.braintrust = await publishToBraintrust(report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
