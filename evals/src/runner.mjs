import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { decideEffect, extractAttestation } from "@ambient-agent/coworker";

const fixturePath = fileURLToPath(
  new URL("../fixtures/synthetic-conversation.v1.json", import.meta.url),
);
const curatedPath = fileURLToPath(new URL("../fixtures/brain-curated.v1.json", import.meta.url));
const datasetPaths = [fixturePath, curatedPath];

async function loadDatasets() {
  return Promise.all(datasetPaths.map((path) => readFile(path, "utf8").then(JSON.parse)));
}

export async function listCases() {
  const datasets = await loadDatasets();
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
  const [fixture, curated] = await loadDatasets();
  const recordedCase = fixture.cases.find(({ id }) => id === caseId);
  if (recordedCase) return evaluateCase(recordedCase);
  const curatedCase = curated.cases.find(({ id }) => id === caseId);
  if (curatedCase) return evaluateCuratedCase(curatedCase);
  throw new Error(`Unknown eval case: ${caseId}`);
}

export async function runDeterministicEvals() {
  const E0Case = {
    id: "reject-empty-evidence",
    caseVersion: "1.0.0",
    provenance: "Build 2 application invariant",
    tags: ["scribe", "risk:integrity"],
    startingState: {},
    decisionBoundary: "Scribe admission",
    allowedEffects: [],
    grader: { implementation: "assert.throws", rubricVersion: "1.0.0" },
  };
  const rejectedEmptyEvidence = (() => {
    try {
      extractAttestation({ id: "event_empty", surfaceId: "surface_eval", text: " " });
      return false;
    } catch (error) {
      return /required/.test(String(error));
    }
  })();
  const E0 = {
    dataset: "generated-invariants",
    version: "1.0.0",
    passed: rejectedEmptyEvidence,
    cases: 1,
    results: [{ ...E0Case, passed: rejectedEmptyEvidence }],
  };

  const [fixture, curated] = await loadDatasets();
  const results = fixture.cases.map(evaluateCase);
  const E1 = {
    dataset: fixture.dataset,
    version: fixture.version,
    passed: results.every(({ passed }) => passed),
    cases: results.length,
    results,
  };

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

const candidates = {
  "application/deterministic": runDeterministicEvals,
};

export async function runBenchmark(candidateIds = ["application/deterministic"]) {
  const candidateResults = [];
  for (const candidateId of candidateIds) {
    const candidate = candidates[candidateId];
    if (!candidate) throw new Error(`Unknown executable benchmark candidate: ${candidateId}`);
    const startedAt = performance.now();
    const evals = await candidate();
    candidateResults.push({
      candidateId,
      repetitions: 1,
      durationMs: performance.now() - startedAt,
      deterministicPassRate: [evals.E0, evals.E1, evals.E2].every(({ passed }) => passed) ? 1 : 0,
      pairedResults: [evals.E0, evals.E1, evals.E2].flatMap(({ results }) =>
        results.map(({ id, passed }) => ({ caseId: id, passed })),
      ),
      tokens: null,
      costUsd: null,
      traceIds: [],
    });
  }
  return {
    datasetVersions: ["generated-invariants@1.0.0", "synthetic-conversation@1.0.0", "brain-curated@1.0.0"],
    repetitions: 1,
    candidates: candidateResults,
    modelInferenceProven: false,
  };
}

export async function publishToBraintrust(report) {
  if (!process.env.BRAINTRUST_API_KEY) {
    return { published: false, reason: "BRAINTRUST_API_KEY is not set" };
  }
  const { init } = await import("braintrust");
  const rows = report.candidates
    ? report.candidates.flatMap((candidate) =>
        candidate.pairedResults.map((result) => ({
          id: `${candidate.candidateId}:${result.caseId}`,
          input: { candidateId: candidate.candidateId, caseId: result.caseId },
          output: result,
          scores: { passed: result.passed ? 1 : 0 },
          metadata: {
            durationMs: candidate.durationMs,
            tokens: candidate.tokens,
            costUsd: candidate.costUsd,
            traceIds: candidate.traceIds,
          },
        })),
      )
    : [report.E0, report.E1, report.E2].flatMap((tier) =>
        tier.results.map((result) => ({
          id: `${tier.dataset}:${result.id}`,
          input: { dataset: tier.dataset, caseId: result.id },
          output: result.output ?? result,
          scores: { passed: result.passed ? 1 : 0 },
          metadata: { datasetVersion: tier.version },
        })),
      );
  const experiment = init("Ambient Agent v2", {
    apiKey: process.env.BRAINTRUST_API_KEY,
    experiment: `build-2-${Date.now()}`,
    metadata: { reportKind: report.candidates ? "benchmark" : "E0/E1/E2" },
  });
  for (const row of rows) {
    experiment.log({
      input: row.input,
      output: row.output,
      scores: row.scores,
      metadata: row.metadata,
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
