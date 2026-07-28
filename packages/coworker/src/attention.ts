import type { DatabaseSync } from "node:sqlite";

import type { ConversationEvent } from "./archive.js";
import { stableId } from "./ids.js";
import type { AttentionId, SurfaceDeliveryId } from "./ids.js";

const attentionSchema = `
    CREATE TABLE IF NOT EXISTS attention_items (
      id TEXT PRIMARY KEY,
      source_event_id TEXT UNIQUE REFERENCES archive_events(id),
      surface_delivery_id TEXT UNIQUE REFERENCES surface_deliveries(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'settled')),
      CHECK ((source_event_id IS NOT NULL) != (surface_delivery_id IS NOT NULL))
    );
  `;

export function createAttentionSchema(database: DatabaseSync) {
  database.exec(attentionSchema);
}

export function needsBuild31AttentionMigration(database: DatabaseSync) {
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'attention_items'")
    .get();
  if (!table) return false;
  return !(database.prepare("PRAGMA table_info(attention_items)").all() as { name: string }[]).some(
    ({ name }) => name === "surface_delivery_id",
  );
}

export function migrateBuild31Attention(database: DatabaseSync) {
  database.exec("ALTER TABLE attention_items RENAME TO attention_items_build31;");
  database.exec(attentionSchema);
  database.exec(`
    INSERT INTO attention_items (id, source_event_id, status)
      SELECT id, source_event_id, status FROM attention_items_build31;
    DROP TABLE attention_items_build31;
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

export function settleAttention(database: DatabaseSync, attentionId: AttentionId) {
  database.prepare("UPDATE attention_items SET status = 'settled' WHERE id = ?").run(attentionId);
}

export function admitDeliveryAttention(
  database: DatabaseSync,
  deliveryId: SurfaceDeliveryId,
) {
  const id = stableId<"AttentionId">("attention", deliveryId) as AttentionId;
  database
    .prepare(
      `INSERT OR IGNORE INTO attention_items
        (id, surface_delivery_id, status) VALUES (?, ?, 'pending')`,
    )
    .run(id, deliveryId);
  return id;
}
