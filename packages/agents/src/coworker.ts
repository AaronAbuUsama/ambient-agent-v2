"use agent";

import { useDataWriter, useModel, useTool } from "@flue/runtime";
import * as v from "valibot";

export const attestationProposalSchema = v.object({
  claim: v.pipe(v.string(), v.minLength(1)),
  confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  evidenceQuote: v.pipe(v.string(), v.minLength(1)),
});

export const brainDecisionSchema = v.object({
  type: v.literal("say"),
  objective: v.pipe(v.string(), v.minLength(1)),
});

export const speakerExpressionSchema = v.object({
  text: v.pipe(v.string(), v.minLength(1)),
});

const model = "opencode-go/glm-5.1";

export function ScribeAgent() {
  useModel(model, { thinkingLevel: "off", compaction: false });
  const write = useDataWriter("attestation", { schema: attestationProposalSchema });
  useTool({
    name: "propose_attestation",
    description: "Record one evidence-grounded Scribe attestation.",
    input: attestationProposalSchema,
    run({ data }) {
      write(data);
      return "Attestation recorded. Finish without calling this tool again.";
    },
  });
  return [
    "You are the global Scribe. Extract evidence; do not judge or speak for the Coworker.",
    "Call propose_attestation exactly once.",
    "evidenceQuote must be an exact non-empty substring of the Conversation Event text.",
  ].join("\n");
}

export function BrainAgent() {
  useModel(model, { thinkingLevel: "off", compaction: false });
  const write = useDataWriter("decision", { schema: brainDecisionSchema });
  useTool({
    name: "choose_say",
    description: "Record the Brain's single response objective.",
    input: brainDecisionSchema,
    run({ data }) {
      write(data);
      return "Decision recorded. Finish without calling this tool again.";
    },
  });
  return [
    "You are the one Brain. Own judgment and choose the response objective.",
    "Do not write the final user-facing message.",
    "Use only facts explicitly present in the supplied event and attestation.",
    "Do not expose internal IDs, model roles, confidence scores, or implementation metadata.",
    "For this slice, call choose_say exactly once with type say.",
  ].join("\n");
}

export function SpeakerAgent() {
  useModel(model, { thinkingLevel: "off", compaction: false });
  const write = useDataWriter("expression", { schema: speakerExpressionSchema });
  useTool({
    name: "express_say",
    description: "Record the Speaker's user-facing expression of the Brain objective.",
    input: speakerExpressionSchema,
    run({ data }) {
      write(data);
      return "Expression recorded. Finish without calling this tool again.";
    },
  });
  return [
    "You are a dumb reactive Speaker.",
    "Express the supplied Brain objective clearly; do not make new global judgments.",
    "Do not add dates or facts absent from the objective.",
    "Do not mention internal IDs, model roles, confidence scores, or implementation metadata.",
    "Call express_say exactly once.",
  ].join("\n");
}

ScribeAgent.agentName = "scribe";
ScribeAgent.durability = { maxAttempts: 3, timeoutMs: 120_000 };
BrainAgent.agentName = "brain";
BrainAgent.durability = { maxAttempts: 3, timeoutMs: 120_000 };
SpeakerAgent.agentName = "speaker";
SpeakerAgent.durability = { maxAttempts: 3, timeoutMs: 120_000 };
