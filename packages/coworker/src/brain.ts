import type { DatabaseSync } from "node:sqlite";

import type { ConversationEvent } from "./archive.js";
import { createBrainBatchId, stableId } from "./ids.js";
import type { AttentionId, BrainBatchId, EffectId } from "./ids.js";
import { immediateTransaction } from "./transaction.js";

export interface BrainEffect {
  id: EffectId;
  batchId: BrainBatchId;
  type: "say";
  surfaceId: ConversationEvent["surfaceId"];
  text: string;
}

export function createBrainSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS brain_batches (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('open', 'settled'))
    );
    CREATE TABLE IF NOT EXISTS brain_batch_members (
      batch_id TEXT NOT NULL REFERENCES brain_batches(id),
      attention_id TEXT NOT NULL UNIQUE REFERENCES attention_items(id),
      PRIMARY KEY (batch_id, attention_id)
    );
    CREATE TRIGGER IF NOT EXISTS brain_batch_members_no_update
      BEFORE UPDATE ON brain_batch_members
      BEGIN SELECT RAISE(ABORT, 'Brain Batch membership is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS brain_batch_members_no_delete
      BEFORE DELETE ON brain_batch_members
      BEGIN SELECT RAISE(ABORT, 'Brain Batch membership is immutable'); END;
  `);
}

export function claimBatch(database: DatabaseSync, attentionId: AttentionId) {
  const batchId = createBrainBatchId(attentionId);
  return immediateTransaction(database, () => {
    database.prepare("INSERT OR IGNORE INTO brain_batches (id, status) VALUES (?, 'open')").run(batchId);
    database
      .prepare("INSERT OR IGNORE INTO brain_batch_members (batch_id, attention_id) VALUES (?, ?)")
      .run(batchId, attentionId);
    return batchId;
  });
}

export function decideEffect(event: ConversationEvent, batchId: BrainBatchId): BrainEffect {
  return {
    id: stableId<"EffectId">("effect", batchId, event.surfaceId, event.text) as EffectId,
    batchId,
    type: "say",
    surfaceId: event.surfaceId,
    text: `Recorded: ${event.text.trim()}`,
  };
}
