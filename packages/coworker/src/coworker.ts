import { DatabaseSync } from "node:sqlite";

import { admitAttention } from "./attention.js";
import { archiveEvent, normalizeConversationEvent } from "./archive.js";
import type { ConversationEventInput } from "./archive.js";
import type { SurfaceDeliveryPort } from "./effects.js";
import type { CoworkerReasoner } from "./reasoning.js";
import { createSchema, runCoworkerSpine } from "./spine.js";
import { immediateTransaction } from "./transaction.js";

export function createCoworker(options: {
  databasePath: string;
  surface: SurfaceDeliveryPort;
  reasoner: CoworkerReasoner;
}) {
  return {
    admitConversationEvent(event: ConversationEventInput) {
      const normalized = normalizeConversationEvent(event);
      const database = new DatabaseSync(options.databasePath);
      createSchema(database);
      try {
        const attentionId = immediateTransaction(database, () => {
          archiveEvent(database, normalized);
          return admitAttention(database, normalized);
        });
        return { attentionId, eventId: normalized.id };
      } finally {
        database.close();
      }
    },
    async runUntilIdle() {
      let processed = 0;
      while (true) {
        const database = new DatabaseSync(options.databasePath);
        let pending: { id: string; surface_id: string; text: string } | undefined;
        try {
          createSchema(database);
          pending = database
            .prepare(
              `SELECT archive.id, archive.surface_id, archive.text
               FROM attention_items AS attention
               JOIN archive_events AS archive ON archive.id = attention.source_event_id
               WHERE attention.status = 'pending'
               ORDER BY attention.id
               LIMIT 1`,
            )
            .get() as typeof pending;
        } finally {
          database.close();
        }
        if (!pending) {
          return { processed };
        }
        await runCoworkerSpine({
          ...options,
          event: normalizeConversationEvent({
            id: pending.id,
            surfaceId: pending.surface_id,
            text: pending.text,
          }),
        });
        processed += 1;
      }
    },
  };
}
