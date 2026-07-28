import type { DatabaseSync } from "node:sqlite";

import type { ConversationEvent } from "./archive.js";
import { stableId } from "./ids.js";
import type { AttentionId } from "./ids.js";

export function createAttentionSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS attention_items (
      id TEXT PRIMARY KEY,
      source_event_id TEXT NOT NULL UNIQUE REFERENCES archive_events(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'settled'))
    );
  `);
}

export function admitAttention(database: DatabaseSync, event: ConversationEvent) {
  const id = stableId<"AttentionId">("attention", event.id) as AttentionId;
  database
    .prepare(
      "INSERT OR IGNORE INTO attention_items (id, source_event_id, status) VALUES (?, ?, 'pending')",
    )
    .run(id, event.id);
  return id;
}
