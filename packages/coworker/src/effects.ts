import type { DatabaseSync } from "node:sqlite";

import type { BrainEffect } from "./brain.js";

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
}
