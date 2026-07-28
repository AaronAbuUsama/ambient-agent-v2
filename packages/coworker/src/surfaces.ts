import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { BrainEffect } from "./brain.js";
import { stableId } from "./ids.js";
import type { EffectId, SurfaceDeliveryId, SurfaceId } from "./ids.js";
import {
  normalizeProviderConversationIdentity,
  type ProviderConversationIdentity,
} from "./provider-conversation.js";

export type SurfaceBindingInput = ProviderConversationIdentity;

export interface SurfaceBinding extends SurfaceBindingInput {
  surfaceId: SurfaceId;
}

export type SurfaceDeliveryResult =
  | { status: "sent"; providerEvidence: string }
  | { status: "failed" | "uncertain"; detail: string };

export interface SurfaceDeliveryPort {
  deliver(effect: BrainEffect): Promise<SurfaceDeliveryResult>;
}

export type SurfaceDeliveryStatus = "pending" | "attempting" | "sent" | "failed" | "uncertain";

export interface SurfaceDelivery {
  id: SurfaceDeliveryId;
  effectId: EffectId;
  surfaceId: SurfaceId;
  status: SurfaceDeliveryStatus;
  providerEvidence: string | null;
  detail: string | null;
}

export function createSurfacesSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS surfaces (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status = 'active')
    );
    CREATE TABLE IF NOT EXISTS surface_bindings (
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      provider_conversation_id TEXT NOT NULL,
      surface_id TEXT NOT NULL UNIQUE REFERENCES surfaces(id),
      PRIMARY KEY (provider, provider_account_id, provider_conversation_id)
    );
    CREATE TABLE IF NOT EXISTS surface_deliveries (
      id TEXT PRIMARY KEY,
      effect_id TEXT NOT NULL UNIQUE REFERENCES effects(id),
      surface_id TEXT NOT NULL REFERENCES surfaces(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'attempting', 'sent', 'failed', 'uncertain')),
      provider_evidence TEXT,
      detail TEXT,
      CHECK (
        (status = 'sent' AND provider_evidence IS NOT NULL AND detail IS NULL)
        OR (status IN ('failed', 'uncertain') AND provider_evidence IS NULL AND detail IS NOT NULL)
        OR (status IN ('pending', 'attempting') AND provider_evidence IS NULL AND detail IS NULL)
      )
    );
  `);
}

export function ensureSurface(database: DatabaseSync, surfaceId: SurfaceId) {
  database
    .prepare("INSERT OR IGNORE INTO surfaces (id, status) VALUES (?, 'active')")
    .run(surfaceId);
}

export function migrateBuild2ArchiveSurfaces(database: DatabaseSync) {
  database.exec(`
    INSERT OR IGNORE INTO surfaces (id, status)
      SELECT DISTINCT surface_id, 'active' FROM archive_events;
  `);
}

export function migrateBuild31SurfaceDeliveries(database: DatabaseSync) {
  const effects = database
    .prepare(
      `SELECT id, surface_id, provider_evidence
         FROM effects
        WHERE status = 'completed' AND provider_evidence IS NOT NULL`,
    )
    .all() as {
    id: EffectId;
    surface_id: SurfaceId;
    provider_evidence: string;
  }[];
  const insert = database.prepare(
    `INSERT OR IGNORE INTO surface_deliveries
      (id, effect_id, surface_id, status, provider_evidence)
     VALUES (?, ?, ?, 'sent', ?)`,
  );
  for (const effect of effects) {
    insert.run(
      stableId<"SurfaceDeliveryId">("delivery", effect.id),
      effect.id,
      effect.surface_id,
      effect.provider_evidence,
    );
  }
}

export function bindSurface(database: DatabaseSync, input: SurfaceBindingInput): SurfaceBinding {
  const binding = normalizeProviderConversationIdentity(input);
  const existing = database
    .prepare(
      `SELECT surface_id FROM surface_bindings
       WHERE provider = ? AND provider_account_id = ? AND provider_conversation_id = ?`,
    )
    .get(binding.provider, binding.providerAccountId, binding.providerConversationId) as
    | { surface_id: SurfaceId }
    | undefined;
  if (existing) {
    return { ...binding, surfaceId: existing.surface_id };
  }
  const surfaceId = `surface_${randomUUID().replaceAll("-", "")}` as SurfaceId;
  ensureSurface(database, surfaceId);
  database
    .prepare(
      `INSERT INTO surface_bindings
        (provider, provider_account_id, provider_conversation_id, surface_id)
       VALUES (?, ?, ?, ?)`,
    )
    .run(binding.provider, binding.providerAccountId, binding.providerConversationId, surfaceId);
  return { ...binding, surfaceId };
}

export function surfaceForProviderConversation(
  database: DatabaseSync,
  input: SurfaceBindingInput,
): SurfaceId | undefined {
  const binding = normalizeProviderConversationIdentity(input);
  const row = database
    .prepare(
      `SELECT surface_id FROM surface_bindings
       WHERE provider = ? AND provider_account_id = ? AND provider_conversation_id = ?`,
    )
    .get(binding.provider, binding.providerAccountId, binding.providerConversationId) as
    | { surface_id: SurfaceId }
    | undefined;
  if (!row) return undefined;
  const surface = database
    .prepare("SELECT status FROM surfaces WHERE id = ?")
    .get(row.surface_id) as { status: string } | undefined;
  assert.equal(surface?.status, "active");
  return row.surface_id;
}

function readSurfaceDelivery(
  database: DatabaseSync,
  deliveryId: SurfaceDeliveryId,
): SurfaceDelivery {
  const row = database
    .prepare(
      `SELECT id, effect_id, surface_id, status, provider_evidence, detail
         FROM surface_deliveries
        WHERE id = ?`,
    )
    .get(deliveryId) as
    | {
        id: SurfaceDeliveryId;
        effect_id: EffectId;
        surface_id: SurfaceId;
        status: SurfaceDeliveryStatus;
        provider_evidence: string | null;
        detail: string | null;
      }
    | undefined;
  assert.ok(row, `Surface Delivery ${deliveryId} must exist`);
  return {
    id: row.id,
    effectId: row.effect_id,
    surfaceId: row.surface_id,
    status: row.status,
    providerEvidence: row.provider_evidence,
    detail: row.detail,
  };
}

export function recordSurfaceDelivery(database: DatabaseSync, effect: BrainEffect) {
  const deliveryId = stableId<"SurfaceDeliveryId">(
    "delivery",
    effect.id,
  ) as SurfaceDeliveryId;
  database
    .prepare(
      `INSERT OR IGNORE INTO surface_deliveries
        (id, effect_id, surface_id, status) VALUES (?, ?, ?, 'pending')`,
    )
    .run(deliveryId, effect.id, effect.surfaceId);
  const delivery = readSurfaceDelivery(database, deliveryId);
  assert.equal(delivery.effectId, effect.id);
  assert.equal(delivery.surfaceId, effect.surfaceId);
  return delivery;
}

export function beginSurfaceDelivery(database: DatabaseSync, deliveryId: SurfaceDeliveryId) {
  const result = database
    .prepare(
      `UPDATE surface_deliveries
          SET status = 'attempting'
        WHERE id = ? AND status = 'pending'`,
    )
    .run(deliveryId);
  return {
    started: result.changes === 1,
    delivery: readSurfaceDelivery(database, deliveryId),
  };
}

export function settleSurfaceDelivery(
  database: DatabaseSync,
  deliveryId: SurfaceDeliveryId,
  result: SurfaceDeliveryResult,
) {
  if (result.status === "sent") {
    assert.ok(result.providerEvidence.trim(), "sent delivery requires provider evidence");
    database
      .prepare(
        `UPDATE surface_deliveries
            SET status = 'sent', provider_evidence = ?, detail = NULL
          WHERE id = ? AND status = 'attempting'`,
      )
      .run(result.providerEvidence.trim(), deliveryId);
  } else {
    assert.ok(result.detail.trim(), `${result.status} delivery requires detail`);
    database
      .prepare(
        `UPDATE surface_deliveries
            SET status = ?, provider_evidence = NULL, detail = ?
          WHERE id = ? AND status = 'attempting'`,
      )
      .run(result.status, result.detail.trim(), deliveryId);
  }
  const delivery = readSurfaceDelivery(database, deliveryId);
  assert.equal(delivery.status, result.status);
  return delivery;
}
