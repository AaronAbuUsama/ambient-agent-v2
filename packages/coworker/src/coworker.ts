import { DatabaseSync } from "node:sqlite";

import { admitAttention } from "./attention.js";
import {
  archiveEvent,
  isAdmittedConversationEvent,
  normalizeObservedConversationEvent,
  readArchivedEvent,
} from "./archive.js";
import type { ArchivedConversationEvent, ConversationEventInput } from "./archive.js";
import type { ConversationEventId } from "./ids.js";
import type { CoworkerReasoner } from "./reasoning.js";
import { createSchema, runCoworkerSpine } from "./spine.js";
import { bindSurface, surfaceForProviderConversation } from "./surfaces.js";
import type { SurfaceBindingInput, SurfaceDeliveryPort } from "./surfaces.js";
import { immediateTransaction } from "./transaction.js";

export function createCoworker(options: {
  databasePath: string;
  surface: SurfaceDeliveryPort;
  reasoner: CoworkerReasoner;
}) {
  let drainTail: Promise<void> = Promise.resolve();

  async function drain() {
    let processed = 0;
    while (true) {
      const database = new DatabaseSync(options.databasePath);
      let pending: { source_event_id: ConversationEventId } | undefined;
      let event: ArchivedConversationEvent | undefined;
      try {
        createSchema(database);
        pending = database
          .prepare(
            `SELECT source_event_id
             FROM attention_items
             WHERE status = 'pending' AND source_event_id IS NOT NULL
             ORDER BY id
             LIMIT 1`,
          )
          .get() as typeof pending;
        event = pending ? readArchivedEvent(database, pending.source_event_id) : undefined;
      } finally {
        database.close();
      }
      if (!pending) {
        return { processed };
      }
      if (!event || !isAdmittedConversationEvent(event)) {
        throw new Error(`Pending Attention references inadmissible event ${pending.source_event_id}`);
      }
      await runCoworkerSpine({
        ...options,
        event,
      });
      processed += 1;
    }
  }

  return {
    bindSurface(input: SurfaceBindingInput) {
      const database = new DatabaseSync(options.databasePath);
      createSchema(database);
      try {
        return immediateTransaction(database, () => bindSurface(database, input));
      } finally {
        database.close();
      }
    },
    observeConversationEvent(event: ConversationEventInput) {
      const database = new DatabaseSync(options.databasePath);
      createSchema(database);
      try {
        return immediateTransaction(database, () => {
          const unbound = normalizeObservedConversationEvent(event);
          const existing = readArchivedEvent(database, unbound.id);
          if (existing) {
            archiveEvent(database, {
              ...unbound,
              ...(existing.surfaceId ? { surfaceId: existing.surfaceId } : {}),
            });
            if (!isAdmittedConversationEvent(existing)) {
              return { eventId: existing.id, outcome: "archived" as const };
            }
            const attentionId = admitAttention(database, existing);
            return {
              eventId: existing.id,
              outcome: "admitted" as const,
              surfaceId: existing.surfaceId,
              attentionId,
            };
          }
          const surfaceId = surfaceForProviderConversation(database, event);
          const normalized = normalizeObservedConversationEvent(event, surfaceId);
          archiveEvent(database, normalized);
          if (!isAdmittedConversationEvent(normalized)) {
            return { eventId: normalized.id, outcome: "archived" as const };
          }
          const attentionId = admitAttention(database, normalized);
          return {
            eventId: normalized.id,
            outcome: "admitted" as const,
            surfaceId: normalized.surfaceId,
            attentionId,
          };
        });
      } finally {
        database.close();
      }
    },
    runUntilIdle() {
      const run = drainTail.then(drain, drain);
      drainTail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
