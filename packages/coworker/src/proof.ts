import type { CoworkerReasoner } from "./reasoning.js";

export const syntheticReasoner: CoworkerReasoner = {
  attestationAuthor: "scribe:synthetic",
  async scribe(event) {
    return {
      claim: `The participant requested: ${event.text}`,
      confidence: 1,
      evidenceQuote: event.text,
    };
  },
  async brain({ event }) {
    return { type: "say", objective: `Record the participant request: ${event.text}` };
  },
  async speaker({ event }) {
    return `Recorded: ${event.text.trim()}`;
  },
};

export { normalizeConversationEvent } from "./archive.js";
export type { ConversationEvent } from "./archive.js";
export { createSayEffect, decideEffect } from "./brain.js";
export type { BrainEffect } from "./brain.js";
export { createBrainBatchId } from "./ids.js";
export type * from "./ids.js";
export { createAttestation, extractAttestation, rebuildGraph } from "./knowledge.js";
export type { Attestation, AttestationProposal } from "./knowledge.js";
export {
  durableBoundaries,
  readCanonicalSpineState,
  readSpineOutcome,
  runCoworkerSpine,
} from "./spine.js";
export type { DurableBoundary } from "./spine.js";
