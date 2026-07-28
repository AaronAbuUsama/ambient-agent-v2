import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

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

export interface ConversationEvent {
  id: string;
  surfaceId: string;
  text: string;
}

export interface Attestation {
  id: string;
  author: "scribe:synthetic";
  claim: string;
  confidence: number;
  evidenceEventId: string;
  evidenceQuote: string;
}

export interface BrainEffect {
  id: string;
  batchId: string;
  type: "say";
  surfaceId: string;
  text: string;
}

export interface SurfaceDeliveryPort {
  deliver(effect: BrainEffect): Promise<{ providerEvidence: string }>;
}

export interface SpineOutcome {
  archiveEvents: number;
  attestations: number;
  beliefs: number;
  attentionItems: number;
  settledAttentionItems: number;
  brainBatches: number;
  brainBatchMembers: number;
  effects: number;
  completedEffects: number;
}

function stableId(prefix: string, ...parts: string[]) {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

export function extractAttestation(event: ConversationEvent): Attestation {
  const text = event.text.trim();
  if (event.id.length === 0 || event.surfaceId.length === 0 || text.length === 0) {
    throw new Error("Conversation Event identity, Surface identity, and text are required");
  }
  return {
    id: stableId("att", event.id, text),
    author: "scribe:synthetic",
    claim: `The participant requested: ${text}`,
    confidence: 1,
    evidenceEventId: event.id,
    evidenceQuote: text,
  };
}

export function decideEffect(event: ConversationEvent, batchId: string): BrainEffect {
  return {
    id: stableId("effect", batchId, event.surfaceId, event.text),
    batchId,
    type: "say",
    surfaceId: event.surfaceId,
    text: `Recorded: ${event.text.trim()}`,
  };
}

function createSchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS archive_events (
      id TEXT PRIMARY KEY,
      surface_id TEXT NOT NULL,
      text TEXT NOT NULL CHECK (length(text) > 0)
    );
    CREATE TRIGGER IF NOT EXISTS archive_events_no_update
      BEFORE UPDATE ON archive_events BEGIN SELECT RAISE(ABORT, 'archive events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS archive_events_no_delete
      BEFORE DELETE ON archive_events BEGIN SELECT RAISE(ABORT, 'archive events are immutable'); END;

    CREATE TABLE IF NOT EXISTS knowledge_attestations (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      claim TEXT NOT NULL CHECK (length(claim) > 0),
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      evidence_event_id TEXT NOT NULL REFERENCES archive_events(id),
      evidence_quote TEXT NOT NULL CHECK (length(evidence_quote) > 0)
    );
    CREATE TRIGGER IF NOT EXISTS knowledge_attestations_no_update
      BEFORE UPDATE ON knowledge_attestations
      BEGIN SELECT RAISE(ABORT, 'attestations are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS knowledge_attestations_no_delete
      BEFORE DELETE ON knowledge_attestations
      BEGIN SELECT RAISE(ABORT, 'attestations are immutable'); END;
    CREATE TABLE IF NOT EXISTS knowledge_beliefs (
      id TEXT PRIMARY KEY,
      attestation_id TEXT NOT NULL UNIQUE REFERENCES knowledge_attestations(id),
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attention_items (
      id TEXT PRIMARY KEY,
      source_event_id TEXT NOT NULL UNIQUE REFERENCES archive_events(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'settled'))
    );
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

function transaction(database: DatabaseSync, action: () => void) {
  database.exec("BEGIN IMMEDIATE");
  try {
    action();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function count(database: DatabaseSync, table: string, where = "") {
  const row = database.prepare(`SELECT count(*) AS count FROM ${table} ${where}`).get() as {
    count: number;
  };
  return Number(row.count);
}

export function readSpineOutcome(databasePath: string): SpineOutcome {
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
    const tables = [
      "archive_events",
      "knowledge_attestations",
      "knowledge_beliefs",
      "attention_items",
      "brain_batches",
      "brain_batch_members",
      "effects",
    ];
    return Object.fromEntries(
      tables.map((table) => [
        table,
        database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
      ]),
    );
  } finally {
    database.close();
  }
}

export async function runCoworkerSpine(options: {
  databasePath: string;
  event: ConversationEvent;
  surface: SurfaceDeliveryPort;
  interrupt?: (boundary: DurableBoundary) => void;
}) {
  const { databasePath, event, surface } = options;
  const interrupt = options.interrupt ?? (() => undefined);
  const database = new DatabaseSync(databasePath);
  createSchema(database);

  try {
    const archived = database.prepare("SELECT surface_id, text FROM archive_events WHERE id = ?").get(
      event.id,
    ) as { surface_id: string; text: string } | undefined;
    if (archived) {
      assert.equal(archived.surface_id, event.surfaceId);
      assert.equal(archived.text, event.text.trim());
    } else {
      const normalized = extractAttestation(event);
      database
        .prepare("INSERT INTO archive_events (id, surface_id, text) VALUES (?, ?, ?)")
        .run(event.id, event.surfaceId, normalized.evidenceQuote);
    }
    interrupt("archive-committed");

    const attestation = extractAttestation(event);
    database
      .prepare(
        `INSERT OR IGNORE INTO knowledge_attestations
          (id, author, claim, confidence, evidence_event_id, evidence_quote)
          VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        attestation.id,
        attestation.author,
        attestation.claim,
        attestation.confidence,
        attestation.evidenceEventId,
        attestation.evidenceQuote,
      );
    interrupt("attestation-committed");

    const beliefId = stableId("belief", attestation.id);
    database
      .prepare(
        `INSERT OR IGNORE INTO knowledge_beliefs
          (id, attestation_id, subject, predicate, object) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(beliefId, attestation.id, event.surfaceId, "latest-request", event.text.trim());
    interrupt("graph-projected");

    const attentionId = stableId("attention", event.id);
    database
      .prepare(
        "INSERT OR IGNORE INTO attention_items (id, source_event_id, status) VALUES (?, ?, 'pending')",
      )
      .run(attentionId, event.id);
    interrupt("attention-admitted");

    const batchId = stableId("batch", attentionId);
    transaction(database, () => {
      database
        .prepare("INSERT OR IGNORE INTO brain_batches (id, status) VALUES (?, 'open')")
        .run(batchId);
      database
        .prepare(
          "INSERT OR IGNORE INTO brain_batch_members (batch_id, attention_id) VALUES (?, ?)",
        )
        .run(batchId, attentionId);
    });
    interrupt("batch-committed");

    const effect = decideEffect(event, batchId);
    database
      .prepare(
        `INSERT OR IGNORE INTO effects
          (id, batch_id, type, surface_id, body, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      )
      .run(effect.id, effect.batchId, effect.type, effect.surfaceId, effect.text);
    interrupt("decision-recorded");

    const effectStatus = database.prepare("SELECT status FROM effects WHERE id = ?").get(effect.id) as {
      status: "pending" | "completed";
    };
    if (effectStatus.status === "pending") {
      const delivery = await surface.deliver(effect);
      interrupt("provider-accepted");
      transaction(database, () => {
        database
          .prepare(
            "UPDATE effects SET status = 'completed', provider_evidence = ? WHERE id = ?",
          )
          .run(delivery.providerEvidence, effect.id);
        database
          .prepare("UPDATE attention_items SET status = 'settled' WHERE id = ?")
          .run(attentionId);
        database.prepare("UPDATE brain_batches SET status = 'settled' WHERE id = ?").run(batchId);
      });
    }
    interrupt("settlement-recorded");
    return { batchId, effectId: effect.id, outcome: readSpineOutcome(databasePath) };
  } finally {
    database.close();
  }
}
