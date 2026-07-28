# Evaluation methodology

## Purpose

Evals tell us whether the Coworker makes the right decisions and whether a model or prompt
change improves the product without violating durable application guarantees.

They do not replace deterministic tests, provider proofs, or recovery receipts.

The old repository's evals are not a baseline: they predate the replacement architecture and
did not provide a working proof floor. Existing traces and database records are raw material
for scenario mining only.

## Evaluation unit

Each eval case contains:

- stable case and dataset version;
- sanitized source observations;
- relevant durable starting state;
- the decision boundary being evaluated;
- allowed tools/effects;
- expected invariants and acceptable outcome set;
- grader implementation and rubric version;
- provenance back to a real failure, product requirement, or authored edge case;
- tags for capability, risk, language, Surface type, and difficulty.

The expected answer is usually a set of acceptable semantic outcomes, not one exact string.

## Eval ladder

| Level | Dataset | Grading | Purpose |
|---|---|---|---|
| E0 | generated edge cases | deterministic assertions | schemas, routing, permissions, invariants |
| E1 | recorded sanitized fixtures | deterministic assertions | regression and architecture behavior |
| E2 | curated scenarios | rubric/model grader plus invariants | decision and conversation quality |
| E3 | frozen benchmark | repeated model runs | model/prompt/tool comparison |
| E4 | sampled production observations | human adjudication then curation | discover unknown failure modes |

E0/E1 gate every PR that touches their boundary. E2 gates capability behavior. E3 informs a
model or prompt decision but cannot override failed deterministic invariants. E4 never trains
the system silently; it produces reviewed candidate cases.

## Failure-to-eval pipeline

1. **Capture:** retain the trace, durable application records, provider evidence, and expected
   product behavior.
2. **Sanitize:** remove secrets and unnecessary personal data while preserving the causal shape.
3. **Minimize:** find the smallest starting state and event sequence that reproduces the failure.
4. **Classify:** application invariant, model judgment, tool selection, expression quality,
   provider behavior, or observability gap.
5. **Specify:** write acceptable outcomes and explicit forbidden outcomes before changing code.
6. **Grade:** prefer deterministic grading; add a rubric/model grader only for genuinely semantic
   judgment.
7. **Regress:** prove the case fails on the bad commit and passes on the candidate.
8. **Promote:** add it to E1/E2; include it in E3 only at the next frozen dataset version.

## Model benchmark protocol

Comparisons use:

- the same immutable dataset version;
- the same application commit, tools, prompts, and context budget;
- explicit model/provider/version identifiers;
- fixed sampling parameters where supported;
- multiple repetitions for non-deterministic cases;
- paired per-case results, not aggregate score alone;
- pass rate for deterministic invariants;
- rubric score and disagreement rate;
- effect selection, duplicate/invalid effect rate, latency, token usage, and cost;
- confidence intervals or raw repetition counts;
- captured Braintrust experiment and trace identifiers.

A model is not promoted solely for a higher mean score. It must satisfy every safety/integrity
floor, and material regressions must be understood case by case.

## Braintrust

Braintrust is the experiment and trace system, not the source of expected behavior.

- Dataset definitions and deterministic graders remain versioned in this repository.
- Experiments upload case inputs, outputs, scores, timings, costs, and trace links.
- Online observations are candidates for E4 until reviewed and sanitized.
- Production traces never become benchmarks automatically.

## Flue

Flue activity provides agent conversation, tool, dispatch, and recovery evidence. Eval adapters
translate those observations into application case outputs. Flue identifiers are correlation
evidence; stable application ids remain the identity of Brain Batches, effects, work, and
deliveries.

## Build integration

- Build 1 creates recovery fixtures for the durable Flue floor.
- Build 2 creates the eval runner, E0/E1 datasets, first E2 Brain cases, and Braintrust adapter.
- Build 3 adds WhatsApp archival/admission/Say cases.
- Build 4 adds GitHub work and frozen E3 model comparisons.
- Build 5 adds tenant isolation and provisioning cases.

## Adding an eval

The eventual `evals` package must expose one documented command to:

1. list datasets and cases;
2. run one case locally;
3. run a deterministic suite;
4. run a versioned benchmark across selected models;
5. emit a machine-readable local report;
6. optionally publish the same run to Braintrust.

No disconnected scripts or session-only benchmark methodology are accepted.
