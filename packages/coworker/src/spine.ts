import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  archiveEvent,
  createArchiveSchema,
  migrateBuild2Archive,
  needsBuild2ArchiveMigration,
} from "./archive.js";
import type { ConversationEvent } from "./archive.js";
import {
  admitAttention,
  admitDeliveryAttention,
  createAttentionSchema,
  migrateBuild31Attention,
  needsBuild31AttentionMigration,
  settleAttention,
} from "./attention.js";
import {
  claimBatch,
  createBrainSchema,
  createSayEffect,
  decideEffect,
  settleBatch,
} from "./brain.js";
import type { BrainEffect } from "./brain.js";
import {
  completeEffect,
  createEffectsSchema,
  migrateBuild31Effects,
  needsBuild31EffectsMigration,
  recordEffect,
} from "./effects.js";
import {
  createAttestation,
  createKnowledgeSchema,
  extractAttestation,
  projectAttestation,
  recordAttestation,
} from "./knowledge.js";
import type { CoworkerReasoner } from "./reasoning.js";
import {
  beginSurfaceDelivery,
  createSurfacesSchema,
  ensureSurface,
  migrateBuild2ArchiveSurfaces,
  migrateBuild31SurfaceDeliveries,
  recordSurfaceDelivery,
  settleSurfaceDelivery,
} from "./surfaces.js";
import type {
  SurfaceDelivery,
  SurfaceDeliveryPort,
  SurfaceDeliveryResult,
} from "./surfaces.js";
import { immediateTransaction } from "./transaction.js";
import type { AttentionId, BrainBatchId, ConversationEventId } from "./ids.js";

export const durableBoundaries = [
  "archive-committed",
  "attestation-committed",
  "graph-projected",
  "attention-admitted",
  "batch-committed",
  "decision-recorded",
  "delivery-attempting",
  "provider-accepted",
  "settlement-recorded",
] as const;
export type DurableBoundary = (typeof durableBoundaries)[number];

function migrateBuild2Schema(database: DatabaseSync) {
  if (!needsBuild2ArchiveMigration(database)) return;
  runSchemaMigration(database, () => {
    migrateBuild2ArchiveSurfaces(database);
    migrateBuild2Archive(database);
  });
}

function runSchemaMigration(database: DatabaseSync, migrate: () => void) {
  database.exec("PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;");
  try {
    database.exec("BEGIN IMMEDIATE");
    migrate();
    database.exec("COMMIT");
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;");
  }
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
}

function migrateBuild31AttentionSchema(database: DatabaseSync) {
  if (!needsBuild31AttentionMigration(database)) return;
  runSchemaMigration(database, () => migrateBuild31Attention(database));
}

function migrateBuild31EffectsSchema(database: DatabaseSync) {
  if (!needsBuild31EffectsMigration(database)) return;
  runSchemaMigration(database, () => {
    migrateBuild31SurfaceDeliveries(database);
    migrateBuild31Effects(database);
  });
}

export function createSchema(database: DatabaseSync) {
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  createSurfacesSchema(database);
  migrateBuild2Schema(database);
  createArchiveSchema(database);
  migrateBuild31AttentionSchema(database);
  createKnowledgeSchema(database);
  createAttentionSchema(database);
  createBrainSchema(database);
  migrateBuild31EffectsSchema(database);
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
      surfaceDeliveries: count(database, "surface_deliveries"),
      sentSurfaceDeliveries: count(database, "surface_deliveries", "WHERE status = 'sent'"),
      failedSurfaceDeliveries: count(database, "surface_deliveries", "WHERE status = 'failed'"),
      uncertainSurfaceDeliveries: count(
        database,
        "surface_deliveries",
        "WHERE status = 'uncertain'",
      ),
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
        "surface_deliveries",
      ].map((table) => [table, database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
    );
  } finally {
    database.close();
  }
}

interface RecordedDeliveryWork {
  attentionId: AttentionId;
  batchId: BrainBatchId;
  effect: BrainEffect;
  delivery: SurfaceDelivery;
}

function readRecordedDeliveryWork(
  database: DatabaseSync,
  eventId: ConversationEventId,
): RecordedDeliveryWork | undefined {
  const row = database
    .prepare(
      `SELECT attention_items.id AS attention_id,
              brain_batches.id AS batch_id,
              effects.id AS effect_id,
              effects.type AS effect_type,
              effects.surface_id AS effect_surface_id,
              effects.body AS effect_body,
              surface_deliveries.id AS delivery_id,
              surface_deliveries.status AS delivery_status,
              surface_deliveries.provider_evidence,
              surface_deliveries.detail
         FROM attention_items
         JOIN brain_batch_members
           ON brain_batch_members.attention_id = attention_items.id
         JOIN brain_batches
           ON brain_batches.id = brain_batch_members.batch_id
         JOIN effects
           ON effects.batch_id = brain_batches.id
         JOIN surface_deliveries
           ON surface_deliveries.effect_id = effects.id
        WHERE attention_items.source_event_id = ?`,
    )
    .get(eventId) as
    | {
        attention_id: AttentionId;
        batch_id: BrainBatchId;
        effect_id: BrainEffect["id"];
        effect_type: BrainEffect["type"];
        effect_surface_id: BrainEffect["surfaceId"];
        effect_body: string;
        delivery_id: SurfaceDelivery["id"];
        delivery_status: SurfaceDelivery["status"];
        provider_evidence: string | null;
        detail: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    attentionId: row.attention_id,
    batchId: row.batch_id,
    effect: {
      id: row.effect_id,
      batchId: row.batch_id,
      type: row.effect_type,
      surfaceId: row.effect_surface_id,
      text: row.effect_body,
    },
    delivery: {
      id: row.delivery_id,
      effectId: row.effect_id,
      surfaceId: row.effect_surface_id,
      status: row.delivery_status,
      providerEvidence: row.provider_evidence,
      detail: row.detail,
    },
  };
}

function settleRecordedDelivery(
  database: DatabaseSync,
  work: RecordedDeliveryWork,
  result: SurfaceDeliveryResult,
) {
  immediateTransaction(database, () => {
    const settled = settleSurfaceDelivery(database, work.delivery.id, result);
    completeEffect(database, work.effect.id);
    settleAttention(database, work.attentionId);
    settleBatch(database, work.batchId);
    if (settled.status === "failed" || settled.status === "uncertain") {
      admitDeliveryAttention(database, settled.id);
    }
  });
}

async function finishRecordedDelivery(
  database: DatabaseSync,
  work: RecordedDeliveryWork,
  surface: SurfaceDeliveryPort,
  interrupt: (boundary: DurableBoundary) => void,
) {
  if (work.delivery.status === "pending") {
    const attempt = immediateTransaction(database, () =>
      beginSurfaceDelivery(database, work.delivery.id),
    );
    assert.equal(
      attempt.started,
      true,
      `Surface Delivery ${work.delivery.id} was claimed elsewhere`,
    );
    assert.equal(attempt.delivery.status, "attempting");
    interrupt("delivery-attempting");
    let result: SurfaceDeliveryResult;
    try {
      result = await surface.deliver(work.effect);
    } catch (error) {
      result = {
        status: "uncertain",
        detail:
          error instanceof Error && error.message.trim()
            ? error.message
            : "provider call ended without a known outcome",
      };
    }
    if (result.status === "sent") interrupt("provider-accepted");
    settleRecordedDelivery(database, work, result);
  } else if (work.delivery.status === "attempting") {
    settleRecordedDelivery(database, work, {
      status: "uncertain",
      detail: "process interrupted during provider delivery",
    });
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
    const existingWork = readRecordedDeliveryWork(database, options.event.id);
    if (existingWork) {
      await finishRecordedDelivery(database, existingWork, options.surface, interrupt);
      interrupt("settlement-recorded");
      return {
        batchId: existingWork.batchId,
        effectId: existingWork.effect.id,
        deliveryId: existingWork.delivery.id,
        outcome: readSpineOutcome(options.databasePath),
      };
    }
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
    const work = immediateTransaction(database, () => {
      const recordedEffect = recordEffect(database, effect);
      return {
        attentionId,
        batchId,
        effect: recordedEffect,
        delivery: recordSurfaceDelivery(database, recordedEffect),
      };
    });
    interrupt("decision-recorded");
    await finishRecordedDelivery(database, work, options.surface, interrupt);
    interrupt("settlement-recorded");
    return {
      batchId,
      effectId: work.effect.id,
      deliveryId: work.delivery.id,
      outcome: readSpineOutcome(options.databasePath),
    };
  } finally {
    database.close();
  }
}
