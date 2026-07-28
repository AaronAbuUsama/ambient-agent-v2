import { createHash } from "node:crypto";

type Brand<Name extends string> = string & { readonly __brand: Name };

export type ConversationEventId = Brand<"ConversationEventId">;
export type SurfaceId = Brand<"SurfaceId">;
export type AttestationId = Brand<"AttestationId">;
export type BeliefId = Brand<"BeliefId">;
export type AttentionId = Brand<"AttentionId">;
export type BrainBatchId = Brand<"BrainBatchId">;
export type EffectId = Brand<"EffectId">;

export function stableId<Name extends string>(
  prefix: string,
  ...parts: string[]
): Brand<Name> {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24);
  return `${prefix}_${digest}` as Brand<Name>;
}
