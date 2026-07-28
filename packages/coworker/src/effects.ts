import type { DatabaseSync } from "node:sqlite";

import type { BrainEffect } from "./brain.js";
import type { EffectId } from "./ids.js";

export interface SurfaceDeliveryPort {
  deliver(effect: BrainEffect): Promise<{ providerEvidence: string }>;
}

export function createEffectsSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS effects (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL UNIQUE REFERENCES brain_batches(id),
      type TEXT NOT NULL CHECK (type = 'say'),
      surface_id TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
      provider_evidence TEXT
    );
  `);
}

export function recordEffect(database: DatabaseSync, effect: BrainEffect) {
  database
    .prepare(
      `INSERT OR IGNORE INTO effects
        (id, batch_id, type, surface_id, body, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    )
    .run(effect.id, effect.batchId, effect.type, effect.surfaceId, effect.text);
  const row = database
    .prepare(
      `SELECT id, batch_id, type, surface_id, body
       FROM effects WHERE id = ?`,
    )
    .get(effect.id) as {
    id: BrainEffect["id"];
    batch_id: BrainEffect["batchId"];
    type: BrainEffect["type"];
    surface_id: BrainEffect["surfaceId"];
    body: string;
  };
  return {
    id: row.id,
    batchId: row.batch_id,
    type: row.type,
    surfaceId: row.surface_id,
    text: row.body,
  } satisfies BrainEffect;
}

export function completeEffect(
  database: DatabaseSync,
  effectId: EffectId,
  providerEvidence: string,
) {
  database
    .prepare("UPDATE effects SET status = 'completed', provider_evidence = ? WHERE id = ?")
    .run(providerEvidence, effectId);
}
