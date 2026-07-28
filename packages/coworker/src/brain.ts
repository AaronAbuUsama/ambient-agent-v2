import type { DatabaseSync } from "node:sqlite";

import type { ConversationEvent } from "./archive.js";
import { stableId } from "./ids.js";
import type { AttentionId, BrainBatchId, EffectId } from "./ids.js";

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
  const batchId = stableId<"BrainBatchId">("batch", attentionId) as BrainBatchId;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("INSERT OR IGNORE INTO brain_batches (id, status) VALUES (?, 'open')").run(batchId);
    database
      .prepare("INSERT OR IGNORE INTO brain_batch_members (batch_id, attention_id) VALUES (?, ?)")
      .run(batchId, attentionId);
    database.exec("COMMIT");
    return batchId;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function decideEffect(event: ConversationEvent, batchId: BrainBatchId | string): BrainEffect {
  return {
    id: stableId<"EffectId">("effect", batchId, event.surfaceId, event.text) as EffectId,
    batchId: batchId as BrainBatchId,
    type: "say",
    surfaceId: event.surfaceId,
    text: `Recorded: ${event.text.trim()}`,
  };
}
