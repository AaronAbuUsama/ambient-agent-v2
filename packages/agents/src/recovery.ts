"use agent";

import { useModel } from "@flue/runtime";

export function RecoveryAgent() {
  useModel("recovery-proof/deterministic", {
    thinkingLevel: "off",
    compaction: false,
  });
  return "Reply with exactly RECOVERED_ONCE and nothing else.";
}

RecoveryAgent.agentName = "recovery";
RecoveryAgent.durability = {
  maxAttempts: 3,
  timeoutMs: 120_000,
};
