import type { ConversationEvent } from "./archive.js";
import type { BrainBatchId } from "./ids.js";
import type { Attestation, AttestationProposal } from "./knowledge.js";

export interface BrainDecision {
  type: "say";
  objective: string;
}

export interface CoworkerReasoner {
  attestationAuthor: Attestation["author"];
  scribe(event: ConversationEvent): Promise<AttestationProposal>;
  brain(input: {
    event: ConversationEvent;
    attestation: Attestation;
    batchId: BrainBatchId;
  }): Promise<BrainDecision>;
  speaker(input: {
    event: ConversationEvent;
    decision: BrainDecision;
    batchId: BrainBatchId;
  }): Promise<string>;
}
