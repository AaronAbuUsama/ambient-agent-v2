import { DatabaseSync } from "node:sqlite";

import { normalizeConversationEvent } from "./archive.js";
import type { ConversationEvent } from "./archive.js";
import { stableId } from "./ids.js";
import type { AttestationId, BeliefId, ConversationEventId } from "./ids.js";
import { immediateTransaction } from "./transaction.js";

export interface Attestation {
  id: AttestationId;
  author: "scribe:synthetic";
  claim: string;
  confidence: number;
  evidenceEventId: ConversationEventId;
  evidenceQuote: string;
}

export function createKnowledgeSchema(database: DatabaseSync) {
  database.exec(`
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
  `);
}

export function extractAttestation(event: ConversationEvent): Attestation {
  const normalized = normalizeConversationEvent(event);
  return {
    id: stableId<"AttestationId">("att", normalized.id, normalized.text),
    author: "scribe:synthetic",
    claim: `The participant requested: ${normalized.text}`,
    confidence: 1,
    evidenceEventId: normalized.id,
    evidenceQuote: normalized.text,
  };
}

export function recordAttestation(database: DatabaseSync, attestation: Attestation) {
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
}

function insertBelief(
  database: DatabaseSync,
  row: { attestation_id: string; surface_id: string; evidence_quote: string },
) {
  const beliefId = stableId<"BeliefId">("belief", row.attestation_id) as BeliefId;
  database
    .prepare(
      `INSERT INTO knowledge_beliefs
        (id, attestation_id, subject, predicate, object) VALUES (?, ?, ?, 'latest-request', ?)`,
    )
    .run(beliefId, row.attestation_id, row.surface_id, row.evidence_quote);
}

export function projectAttestation(database: DatabaseSync, attestation: Attestation) {
  const row = database
    .prepare(
      `SELECT a.id AS attestation_id, e.surface_id, a.evidence_quote
       FROM knowledge_attestations a JOIN archive_events e ON e.id = a.evidence_event_id
       WHERE a.id = ?`,
    )
    .get(attestation.id) as {
    attestation_id: string;
    surface_id: string;
    evidence_quote: string;
  };
  database.prepare("DELETE FROM knowledge_beliefs WHERE attestation_id = ?").run(attestation.id);
  insertBelief(database, row);
}

export function rebuildGraph(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  try {
    immediateTransaction(database, () => {
      database.exec("DELETE FROM knowledge_beliefs");
      const rows = database
        .prepare(
          `SELECT a.id AS attestation_id, e.surface_id, a.evidence_quote
           FROM knowledge_attestations a JOIN archive_events e ON e.id = a.evidence_event_id
           ORDER BY a.id`,
        )
        .all() as Array<{ attestation_id: string; surface_id: string; evidence_quote: string }>;
      for (const row of rows) insertBelief(database, row);
    });
  } finally {
    database.close();
  }
}
