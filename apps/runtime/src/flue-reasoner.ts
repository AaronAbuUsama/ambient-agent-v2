import {
  BrainAgent,
  ScribeAgent,
  SpeakerAgent,
  attestationProposalSchema,
  brainDecisionSchema,
  speakerExpressionSchema,
} from "@ambient-agent/agents/coworker";
import type { CoworkerReasoner } from "@ambient-agent/coworker";
import { init } from "@flue/runtime";
import type { Agent } from "@flue/runtime";
import * as v from "valibot";

async function ask<TSchema extends v.GenericSchema>(
  agent: Agent,
  instanceId: string,
  channel: string,
  input: unknown,
  schema: TSchema,
): Promise<v.InferOutput<TSchema>> {
  const handle = init(agent, { id: instanceId });
  const receipt = await handle.dispatch(JSON.stringify(input));
  const reply = await handle.read(receipt, { signal: AbortSignal.timeout(120_000) });
  const value = reply.data[channel]?.at(-1);
  if (value === undefined) {
    throw new Error(`${channel} agent result is missing`);
  }
  return v.parse(schema, value);
}

export function createFlueReasoner(
  record: (role: "scribe" | "brain" | "speaker", output: unknown) => void = () => undefined,
): CoworkerReasoner {
  return {
    attestationAuthor: "scribe:model",
    async scribe(event) {
      const output = await ask(
        ScribeAgent,
        `scribe-${event.id}`,
        "attestation",
        { event },
        attestationProposalSchema,
      );
      record("scribe", output);
      return output;
    },
    async brain(input) {
      const output = await ask(
        BrainAgent,
        `brain-${input.batchId}`,
        "decision",
        {
          eventText: input.event.text,
          attestation: {
            claim: input.attestation.claim,
            confidence: input.attestation.confidence,
            evidenceQuote: input.attestation.evidenceQuote,
          },
        },
        brainDecisionSchema,
      );
      record("brain", output);
      return output;
    },
    async speaker(input) {
      const output = await ask(
        SpeakerAgent,
        `speaker-${input.batchId}`,
        "expression",
        {
          eventText: input.event.text,
          objective: input.decision.objective,
        },
        speakerExpressionSchema,
      );
      record("speaker", output);
      return output.text;
    },
  };
}
