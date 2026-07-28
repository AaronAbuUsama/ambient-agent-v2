import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";

import type { ConversationEventId, SurfaceId } from "./ids.js";

export interface ConversationEvent {
  id: ConversationEventId;
  surfaceId: SurfaceId;
  text: string;
}

export function createArchiveSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS archive_events (
      id TEXT PRIMARY KEY,
      surface_id TEXT NOT NULL,
      text TEXT NOT NULL CHECK (length(text) > 0)
    );
    CREATE TRIGGER IF NOT EXISTS archive_events_no_update
      BEFORE UPDATE ON archive_events BEGIN SELECT RAISE(ABORT, 'archive events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS archive_events_no_delete
      BEFORE DELETE ON archive_events BEGIN SELECT RAISE(ABORT, 'archive events are immutable'); END;
  `);
}

export function archiveEvent(database: DatabaseSync, event: ConversationEvent) {
  const text = event.text.trim();
  if (!event.id || !event.surfaceId || !text) {
    throw new Error("Conversation Event identity, Surface identity, and text are required");
  }
  const archived = database.prepare("SELECT surface_id, text FROM archive_events WHERE id = ?").get(
    event.id,
  ) as { surface_id: string; text: string } | undefined;
  if (archived) {
    assert.equal(archived.surface_id, event.surfaceId);
    assert.equal(archived.text, text);
    return;
  }
  database
    .prepare("INSERT INTO archive_events (id, surface_id, text) VALUES (?, ?, ?)")
    .run(event.id, event.surfaceId, text);
}
