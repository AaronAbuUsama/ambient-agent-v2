import { DatabaseSync } from "node:sqlite";

import { archiveEvent, createArchiveSchema } from "./archive.js";
import type { ConversationEvent } from "./archive.js";
import { admitAttention, createAttentionSchema, settleAttention } from "./attention.js";
import {
  claimBatch,
  createBrainSchema,
  createSayEffect,
  decideEffect,
  settleBatch,
} from "./brain.js";
import { completeEffect, createEffectsSchema, recordEffect } from "./effects.js";
import type { SurfaceDeliveryPort } from "./effects.js";
import {
  createAttestation,
  createKnowledgeSchema,
  extractAttestation,
  projectAttestation,
  recordAttestation,
} from "./knowledge.js";
import type { CoworkerReasoner } from "./reasoning.js";
import { createSurfacesSchema, ensureSurface } from "./surfaces.js";
import { immediateTransaction } from "./transaction.js";

export const durableBoundaries = [
  "archive-committed",
  "attestation-committed",
  "graph-projected",
  "attention-admitted",
  "batch-committed",
  "decision-recorded",
  "provider-accepted",
  "settlement-recorded",
] as const;
export type DurableBoundary = (typeof durableBoundaries)[number];

export function createSchema(database: DatabaseSync) {
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  createSurfacesSchema(database);
  createArchiveSchema(database);
  createKnowledgeSchema(database);
  createAttentionSchema(database);
  createBrainSchema(database);
  createEffectsSchema(database);
}

function count(database: DatabaseSync, table: string, where = "") {
  const row = database.prepare(`SELECT count(*) AS count FROM ${table} ${where}`).get() as {
    count: number;
  };
  return Number(row.count);
}

export function readSpineOutcome(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  try {
    createSchema(database);
    return {
      archiveEvents: count(database, "archive_events"),
      attestations: count(database, "knowledge_attestations"),
      beliefs: count(database, "knowledge_beliefs"),
      attentionItems: count(database, "attention_items"),
      settledAttentionItems: count(database, "attention_items", "WHERE status = 'settled'"),
      brainBatches: count(database, "brain_batches"),
      brainBatchMembers: count(database, "brain_batch_members"),
      effects: count(database, "effects"),
      completedEffects: count(database, "effects", "WHERE status = 'completed'"),
    };
  } finally {
    database.close();
  }
}

export function readCanonicalSpineState(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  try {
    createSchema(database);
    return Object.fromEntries(
      [
        "archive_events",
        "knowledge_attestations",
        "knowledge_beliefs",
        "attention_items",
        "brain_batches",
        "brain_batch_members",
        "effects",
      ].map((table) => [table, database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
    );
  } finally {
    database.close();
  }
}

export async function runCoworkerSpine(options: {
  databasePath: string;
  event: ConversationEvent;
  surface: SurfaceDeliveryPort;
  reasoner?: CoworkerReasoner;
  interrupt?: (boundary: DurableBoundary) => void;
}) {
  const interrupt = options.interrupt ?? (() => undefined);
  const database = new DatabaseSync(options.databasePath);
  createSchema(database);
  try {
    ensureSurface(database, options.event.surfaceId);
    archiveEvent(database, options.event);
    interrupt("archive-committed");
    const proposedAttestation = options.reasoner
      ? createAttestation(
          options.event,
          await options.reasoner.scribe(options.event),
          options.reasoner.attestationAuthor,
        )
      : extractAttestation(options.event);
    const attestation = recordAttestation(database, proposedAttestation);
    interrupt("attestation-committed");
    projectAttestation(database, attestation);
    interrupt("graph-projected");
    const attentionId = admitAttention(database, options.event);
    interrupt("attention-admitted");
    const batchId = claimBatch(database, attentionId);
    interrupt("batch-committed");
    const effect = options.reasoner
      ? createSayEffect(
          options.event,
          batchId,
          await options.reasoner.speaker({
            event: options.event,
            decision: await options.reasoner.brain({
              event: options.event,
              attestation,
              batchId,
            }),
            batchId,
          }),
        )
      : decideEffect(options.event, batchId);
    const recordedEffect = recordEffect(database, effect);
    interrupt("decision-recorded");
    const { status } = database
      .prepare("SELECT status FROM effects WHERE id = ?")
      .get(recordedEffect.id) as {
      status: "pending" | "completed";
    };
    if (status === "pending") {
      const delivery = await options.surface.deliver(recordedEffect);
      interrupt("provider-accepted");
      immediateTransaction(database, () => {
        completeEffect(database, recordedEffect.id, delivery.providerEvidence);
        settleAttention(database, attentionId);
        settleBatch(database, batchId);
      });
    }
    interrupt("settlement-recorded");
    return { batchId, effectId: recordedEffect.id, outcome: readSpineOutcome(options.databasePath) };
  } finally {
    database.close();
  }
}
