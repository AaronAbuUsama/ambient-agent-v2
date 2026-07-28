import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { SurfaceId } from "./ids.js";

export interface SurfaceBindingInput {
  provider: string;
  providerAccountId: string;
  providerConversationId: string;
}

export interface SurfaceBinding extends SurfaceBindingInput {
  surfaceId: SurfaceId;
}

const normalizeBinding = (binding: SurfaceBindingInput): SurfaceBindingInput => {
  const provider = binding.provider.trim();
  const providerAccountId = binding.providerAccountId.trim();
  const providerConversationId = binding.providerConversationId.trim();
  if (!provider || !providerAccountId || !providerConversationId) {
    throw new Error("Provider, provider account, and provider conversation are required");
  }
  return { provider, providerAccountId, providerConversationId };
};

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
  `);
}

export function ensureSurface(database: DatabaseSync, surfaceId: SurfaceId) {
  database
    .prepare("INSERT OR IGNORE INTO surfaces (id, status) VALUES (?, 'active')")
    .run(surfaceId);
}

export function bindSurface(database: DatabaseSync, input: SurfaceBindingInput): SurfaceBinding {
  const binding = normalizeBinding(input);
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
  const binding = normalizeBinding(input);
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
