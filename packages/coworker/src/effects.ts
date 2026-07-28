import type { DatabaseSync } from "node:sqlite";

import type { BrainEffect } from "./brain.js";
import type { EffectId } from "./ids.js";

const effectsSchema = `
    CREATE TABLE IF NOT EXISTS effects (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL UNIQUE REFERENCES brain_batches(id),
      type TEXT NOT NULL CHECK (type = 'say'),
      surface_id TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed'))
    );
  `;

export function createEffectsSchema(database: DatabaseSync) {
  database.exec(effectsSchema);
}

export function needsBuild31EffectsMigration(database: DatabaseSync) {
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effects'")
    .get();
  if (!table) return false;
  return (database.prepare("PRAGMA table_info(effects)").all() as { name: string }[]).some(
    ({ name }) => name === "provider_evidence",
  );
}

export function migrateBuild31Effects(database: DatabaseSync) {
  database.exec("ALTER TABLE effects RENAME TO effects_build31;");
  database.exec(effectsSchema);
  database.exec(`
    INSERT INTO effects (id, batch_id, type, surface_id, body, status)
      SELECT id, batch_id, type, surface_id, body, status FROM effects_build31;
    DROP TABLE effects_build31;
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

export function completeEffect(database: DatabaseSync, effectId: EffectId) {
  database.prepare("UPDATE effects SET status = 'completed' WHERE id = ?").run(effectId);
}
