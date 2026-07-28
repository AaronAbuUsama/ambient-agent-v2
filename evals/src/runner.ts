import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  createBrainBatchId,
  decideEffect,
  extractAttestation,
} from "@ambient-agent/coworker";
import type { ConversationEvent } from "@ambient-agent/coworker";

type EvalTier = "E0" | "E1" | "E2";

interface EvalCaseBase {
  id: string;
  caseVersion: string;
  provenance: string;
  tags: string[];
  startingState: Record<string, unknown>;
  decisionBoundary: string;
  allowedEffects: string[];
  grader: {
    implementation: string;
    rubricVersion: string;
  };
  input: ConversationEvent;
}

interface GeneratedCase extends EvalCaseBase {
  expected: {
    acceptableOutcomes: string[];
    forbiddenOutcomes: string[];
    invariants: string[];
    errorPattern: string;
  };
}

interface RecordedCase extends EvalCaseBase {
  expected: {
    claim: string;
    evidenceQuote: string;
    effectType: string;
    effectText: string;
    invariants: string[];
  };
}

interface CuratedCase extends EvalCaseBase {
  acceptable: {
    effectTypes: string[];
    targetSurfaceId: string;
    requiredMeaning: string[];
  };
  forbidden: {
    effectTypes: string[];
    otherSurface: boolean;
  };
}

type EvalCase = GeneratedCase | RecordedCase | CuratedCase;

type EvalDataset =
  | { dataset: string; version: string; tier: "E0"; cases: GeneratedCase[] }
  | { dataset: string; version: string; tier: "E1"; cases: RecordedCase[] }
  | { dataset: string; version: string; tier: "E2"; cases: CuratedCase[] };

interface CaseResult {
  id: string;
  caseVersion: string;
  provenance: string;
  tags: string[];
  startingState: Record<string, unknown>;
  decisionBoundary: string;
  allowedEffects: string[];
  grader: EvalCaseBase["grader"];
  input: ConversationEvent;
  expected: unknown;
  durationMs: number;
  tokens: null;
  costUsd: null;
  traceIds: string[];
  passed: boolean;
  assertions?: Record<string, boolean>;
  rubric?: Record<string, boolean>;
  output: unknown;
}

interface EvalSuite {
  dataset: string;
  version: string;
  passed: boolean;
  cases: number;
  results: CaseResult[];
}

type EvalReport = Record<EvalTier, EvalSuite>;

interface PairedResult extends CaseResult {
  tier: EvalTier;
  dataset: string;
  datasetVersion: string;
}

interface BenchmarkCandidate {
  candidateId: string;
  repetitions: number;
  durationMs: number;
  deterministicPassRate: number;
  pairedResults: PairedResult[];
  tokens: null;
  costUsd: null;
  traceIds: string[];
}

interface BenchmarkReport {
  datasetVersions: string[];
  repetitions: number;
  candidates: BenchmarkCandidate[];
  modelInferenceProven: boolean;
}

interface SingleCaseReport extends CaseResult {
  tier: EvalTier;
  dataset: string;
  version: string;
}

interface BraintrustContext {
  candidateId?: string;
  tier: EvalTier;
  dataset: string;
  datasetVersion: string;
  candidateDurationMs?: number;
}

interface BraintrustRow {
  id: string;
  input: Record<string, unknown>;
  output: unknown;
  scores: Record<string, number>;
  metadata: Record<string, unknown>;
}

const generatedPath = fileURLToPath(
  new URL("../fixtures/generated-invariants.v1.json", import.meta.url),
);
const fixturePath = fileURLToPath(
  new URL("../fixtures/synthetic-conversation.v1.json", import.meta.url),
);
const curatedPath = fileURLToPath(new URL("../fixtures/brain-curated.v1.json", import.meta.url));
const datasetPaths = [generatedPath, fixturePath, curatedPath];

async function loadDatasets(): Promise<EvalDataset[]> {
  return Promise.all(
    datasetPaths.map(async (path) => JSON.parse(await readFile(path, "utf8")) as EvalDataset),
  );
}

export async function listCases() {
  const datasets = await loadDatasets();
  return datasets.flatMap((dataset) =>
    dataset.cases.map(({ id, provenance, tags }) => ({
      tier: dataset.tier,
      dataset: dataset.dataset,
      version: dataset.version,
      id,
      provenance,
      tags,
    })),
  );
}

function completeCase(
  testCase: EvalCase,
  startedAt: number,
  evaluation: Pick<CaseResult, "passed" | "output"> &
    Partial<Pick<CaseResult, "assertions" | "rubric">>,
): CaseResult {
  return {
    id: testCase.id,
    caseVersion: testCase.caseVersion,
    provenance: testCase.provenance,
    tags: testCase.tags,
    startingState: testCase.startingState,
    decisionBoundary: testCase.decisionBoundary,
    allowedEffects: testCase.allowedEffects,
    grader: testCase.grader,
    input: testCase.input,
    expected:
      "expected" in testCase
        ? testCase.expected
        : {
            acceptableOutcomes: testCase.acceptable,
            forbiddenOutcomes: testCase.forbidden,
          },
    durationMs: performance.now() - startedAt,
    tokens: null,
    costUsd: null,
    traceIds: [],
    ...evaluation,
  };
}

function evaluateGeneratedCase(testCase: GeneratedCase): CaseResult {
  const startedAt = performance.now();
  let errorMessage = "";
  try {
    extractAttestation(testCase.input);
  } catch (error) {
    errorMessage = String(error);
  }
  const assertions = {
    rejected: errorMessage.length > 0,
    expectedError: new RegExp(testCase.expected.errorPattern).test(errorMessage),
  };
  return completeCase(testCase, startedAt, {
    passed: Object.values(assertions).every(Boolean),
    assertions,
    output: {
      outcome: errorMessage ? "reject-invalid-observation" : "attestation-created",
      error: errorMessage || null,
    },
  });
}

function evaluateRecordedCase(testCase: RecordedCase): CaseResult {
  const startedAt = performance.now();
  const attestation = extractAttestation(testCase.input);
  const effect = decideEffect(testCase.input, createBrainBatchId("eval", testCase.id));
  const assertions = {
    claim: attestation.claim === testCase.expected.claim,
    evidence: attestation.evidenceQuote === testCase.expected.evidenceQuote,
    evidenceIdentity: attestation.evidenceEventId === testCase.input.id,
    effectType: effect.type === testCase.expected.effectType,
    effectText: effect.text === testCase.expected.effectText,
  };
  return completeCase(testCase, startedAt, {
    passed: Object.values(assertions).every(Boolean),
    assertions,
    output: { attestation, effect },
  });
}

function evaluateCuratedCase(testCase: CuratedCase): CaseResult {
  const startedAt = performance.now();
  const effect = decideEffect(testCase.input, createBrainBatchId("curated", testCase.id));
  const normalizedText = effect.text.toLowerCase();
  const rubric = {
    allowedEffect: testCase.acceptable.effectTypes.includes(effect.type),
    correctSurface: effect.surfaceId === testCase.acceptable.targetSurfaceId,
    requiredMeaning: testCase.acceptable.requiredMeaning.every((term) =>
      normalizedText.includes(term),
    ),
    forbiddenEffect: !testCase.forbidden.effectTypes.includes(effect.type),
  };
  return completeCase(testCase, startedAt, {
    passed: Object.values(rubric).every(Boolean),
    rubric,
    output: effect,
  });
}

function executeCase(dataset: EvalDataset, testCase: EvalCase): CaseResult {
  if (dataset.tier === "E0") return evaluateGeneratedCase(testCase as GeneratedCase);
  if (dataset.tier === "E1") return evaluateRecordedCase(testCase as RecordedCase);
  return evaluateCuratedCase(testCase as CuratedCase);
}

export async function runCase(caseId: string): Promise<SingleCaseReport> {
  const datasets = await loadDatasets();
  for (const dataset of datasets) {
    const testCase = dataset.cases.find(({ id }) => id === caseId);
    if (testCase) {
      return {
        tier: dataset.tier,
        dataset: dataset.dataset,
        version: dataset.version,
        ...executeCase(dataset, testCase),
      };
    }
  }
  throw new Error(`Unknown eval case: ${caseId}`);
}

export async function runDeterministicEvals(): Promise<EvalReport> {
  const datasets = await loadDatasets();
  return Object.fromEntries(
    datasets.map((dataset) => {
      const results = dataset.cases.map((testCase) => executeCase(dataset, testCase));
      return [
        dataset.tier,
        {
          dataset: dataset.dataset,
          version: dataset.version,
          passed: results.every(({ passed }) => passed),
          cases: results.length,
          results,
        },
      ];
    }),
  ) as EvalReport;
}

const candidates: Record<string, () => Promise<EvalReport>> = {
  "application/deterministic": runDeterministicEvals,
};

export async function runBenchmark(
  candidateIds = ["application/deterministic"],
): Promise<BenchmarkReport> {
  const candidateResults: BenchmarkCandidate[] = [];
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
      pairedResults: (Object.entries(evals) as Array<[EvalTier, EvalSuite]>).flatMap(
        ([tier, suite]) =>
          suite.results.map((result) => ({
            tier,
            dataset: suite.dataset,
            datasetVersion: suite.version,
            ...result,
          })),
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

function normalizeCase(result: CaseResult, context: BraintrustContext): BraintrustRow {
  const checks = result.assertions ?? result.rubric ?? {};
  return {
    id: `${context.candidateId ? `${context.candidateId}:` : ""}${context.dataset}:${result.id}`,
    input: {
      candidateId: context.candidateId,
      dataset: context.dataset,
      datasetVersion: context.datasetVersion,
      caseId: result.id,
      caseVersion: result.caseVersion,
      sourceObservation: result.input,
      startingState: result.startingState,
      decisionBoundary: result.decisionBoundary,
      allowedEffects: result.allowedEffects,
      expected: result.expected,
      provenance: result.provenance,
      tags: result.tags,
      grader: result.grader,
    },
    output: result.output,
    scores: {
      passed: result.passed ? 1 : 0,
      ...Object.fromEntries(
        Object.entries(checks)
          .filter(([, value]) => typeof value === "boolean")
          .map(([name, value]) => [name, value ? 1 : 0]),
      ),
    },
    metadata: {
      tier: context.tier,
      durationMs: result.durationMs,
      tokens: result.tokens,
      costUsd: result.costUsd,
      traceIds: result.traceIds,
      candidateDurationMs: context.candidateDurationMs,
    },
  };
}

export function normalizeBraintrustRows(
  report: EvalReport | BenchmarkReport | SingleCaseReport,
): BraintrustRow[] {
  if ("candidates" in report) {
    return report.candidates.flatMap((candidate) =>
      candidate.pairedResults.map((result) =>
        normalizeCase(result, {
          candidateId: candidate.candidateId,
          tier: result.tier,
          dataset: result.dataset,
          datasetVersion: result.datasetVersion,
          candidateDurationMs: candidate.durationMs,
        }),
      ),
    );
  }
  if ("E0" in report) {
    return (Object.entries(report) as Array<[EvalTier, EvalSuite]>).flatMap(
      ([tier, suite]) =>
        suite.results.map((result) =>
          normalizeCase(result, {
            tier,
            dataset: suite.dataset,
            datasetVersion: suite.version,
          }),
        ),
    );
  }
  if ("id" in report && "dataset" in report) {
    return [
      normalizeCase(report, {
        tier: report.tier,
        dataset: report.dataset,
        datasetVersion: report.version,
      }),
    ];
  }
  throw new Error("Unsupported Braintrust report shape");
}

export async function publishToBraintrust(
  report: EvalReport | BenchmarkReport | SingleCaseReport,
) {
  if (!process.env.BRAINTRUST_API_KEY) {
    return { published: false, reason: "BRAINTRUST_API_KEY is not set" };
  }
  const { init } = await import("braintrust");
  const rows = normalizeBraintrustRows(report);
  const experiment = init("Ambient Agent v2", {
    apiKey: process.env.BRAINTRUST_API_KEY,
    experiment: `build-2-${Date.now()}`,
    metadata: {
      reportKind:
        "candidates" in report ? "benchmark" : "E0" in report ? "E0/E1/E2" : "single-case",
    },
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
  let report:
    | Awaited<ReturnType<typeof listCases>>
    | EvalReport
    | BenchmarkReport
    | SingleCaseReport;
  if (command === "list") report = await listCases();
  else if (command === "run") {
    if (!argument) throw new Error("Eval case id is required");
    report = await runCase(argument);
  }
  else if (command === "benchmark") report = await runBenchmark(argument?.split(","));
  else if (command === "deterministic") report = await runDeterministicEvals();
  else throw new Error(`Unknown eval command: ${command}`);

  if (
    !Array.isArray(report) &&
    "E0" in report &&
    ![report.E0, report.E1, report.E2].every(({ passed }) => passed)
  ) {
    throw new Error("Deterministic eval gate failed");
  }
  if (process.env.EVAL_REPORT_PATH) {
    await writeFile(process.env.EVAL_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }
  let output: unknown = report;
  if (process.env.BRAINTRUST_PUBLISH === "1") {
    if (Array.isArray(report)) throw new Error("Braintrust publication does not support case lists");
    output = { ...report, braintrust: await publishToBraintrust(report) };
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
