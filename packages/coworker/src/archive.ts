import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";

import { stableId } from "./ids.js";
import type { ConversationEventId, SurfaceId } from "./ids.js";

interface ConversationEventInputBase {
  provider: string;
  providerAccountId: string;
  providerConversationId: string;
  providerMessageId: string;
  direction: "inbound" | "outbound";
  occurredAt: number;
  senderId?: string;
}

export type ConversationContentType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "unknown";

export interface ConversationArrivalInput extends ConversationEventInputBase {
  kind: "arrival";
  text: string;
  contentType?: ConversationContentType;
  media?: {
    mimetype?: string;
    fileName?: string;
    byteLength?: number;
    caption?: string;
  };
}

export interface ConversationEditInput extends ConversationEventInputBase {
  kind: "edit";
  text: string;
}

export interface ConversationRevocationInput extends ConversationEventInputBase {
  kind: "revocation";
  actorId?: string;
}

export interface ConversationReactionInput extends ConversationEventInputBase {
  kind: "reaction";
  actorId?: string;
  emoji?: string;
  removed: boolean;
}

export interface ConversationReceiptInput extends ConversationEventInputBase {
  kind: "receipt";
  actorId?: string;
  status: ConversationReceiptStatus;
}

export type ConversationReceiptStatus = "sent" | "delivered" | "read" | "played" | "failed";

export type ConversationEventInput =
  | ConversationArrivalInput
  | ConversationEditInput
  | ConversationRevocationInput
  | ConversationReactionInput
  | ConversationReceiptInput;

export interface ArchivedConversationEvent {
  id: ConversationEventId;
  provider: string;
  providerAccountId: string;
  providerConversationId: string;
  providerMessageId: string;
  kind: ConversationEventInput["kind"];
  direction: "inbound" | "outbound";
  occurredAt: number;
  senderId?: string;
  surfaceId?: SurfaceId;
  text: string;
  payload: Record<string, unknown>;
}

export interface ConversationEvent extends ArchivedConversationEvent {
  direction: "inbound";
  surfaceId: SurfaceId;
  text: string;
}

export interface ProofConversationEventInput {
  id: string;
  surfaceId: string;
  text: string;
}

export function normalizeConversationEvent(event: ProofConversationEventInput): ConversationEvent {
  const text = event.text.trim();
  if (!event.id || !event.surfaceId || !text) {
    throw new Error("Conversation Event identity, Surface identity, and text are required");
  }
  return {
    id: event.id as ConversationEventId,
    provider: "synthetic-proof",
    providerAccountId: "synthetic-proof",
    providerConversationId: event.surfaceId,
    providerMessageId: event.id,
    kind: "arrival",
    direction: "inbound",
    occurredAt: 0,
    surfaceId: event.surfaceId as SurfaceId,
    text,
    payload: {},
  };
}

export function normalizeObservedConversationEvent(
  event: ConversationEventInput,
  surfaceId?: SurfaceId,
): ArchivedConversationEvent {
  const provider = event.provider.trim();
  const providerAccountId = event.providerAccountId.trim();
  const providerConversationId = event.providerConversationId.trim();
  const providerMessageId = event.providerMessageId.trim();
  const senderId = event.senderId?.trim();
  const text = "text" in event ? event.text.trim() : "";
  if (
    !provider ||
    !providerAccountId ||
    !providerConversationId ||
    !providerMessageId ||
    !Number.isSafeInteger(event.occurredAt) ||
    event.occurredAt < 0 ||
    !["inbound", "outbound"].includes(event.direction)
  ) {
    throw new Error("Provider identity, conversation identity, message identity, and time are required");
  }
  let payload: Record<string, unknown>;
  let identityDetail = "";
  switch (event.kind) {
    case "arrival": {
      const contentType = event.contentType?.trim() || "text";
      if (
        ![
          "text",
          "image",
          "audio",
          "video",
          "document",
          "sticker",
          "location",
          "contact",
          "unknown",
        ].includes(contentType)
      ) {
        throw new Error(`Unsupported Conversation content type: ${contentType}`);
      }
      const media = event.media
        ? {
            ...(event.media.mimetype?.trim()
              ? { mimetype: event.media.mimetype.trim() }
              : {}),
            ...(event.media.fileName?.trim()
              ? { fileName: event.media.fileName.trim() }
              : {}),
            ...(event.media.byteLength !== undefined
              ? { byteLength: event.media.byteLength }
              : {}),
            ...(event.media.caption?.trim()
              ? { caption: event.media.caption.trim() }
              : {}),
          }
        : undefined;
      if (
        media?.byteLength !== undefined &&
        (!Number.isSafeInteger(media.byteLength) || media.byteLength < 0)
      ) {
        throw new Error("Media byte length must be a non-negative safe integer");
      }
      payload = {
        contentType,
        ...(media && Object.keys(media).length > 0 ? { media } : {}),
      };
      break;
    }
    case "edit":
      payload = { text };
      identityDetail = JSON.stringify([event.occurredAt, text]);
      break;
    case "revocation": {
      const actorId = event.actorId?.trim();
      payload = actorId ? { actorId } : {};
      identityDetail = JSON.stringify([event.occurredAt, actorId ?? null]);
      break;
    }
    case "reaction": {
      if (typeof event.removed !== "boolean") {
        throw new Error("A Conversation reaction requires a removal flag");
      }
      const actorId = event.actorId?.trim();
      const emoji = event.emoji?.trim();
      payload = {
        ...(actorId ? { actorId } : {}),
        ...(emoji ? { emoji } : {}),
        removed: event.removed,
      };
      identityDetail = JSON.stringify([
        event.occurredAt,
        actorId ?? null,
        event.removed,
        emoji ?? null,
      ]);
      break;
    }
    case "receipt": {
      const actorId = event.actorId?.trim();
      const status = event.status.trim();
      if (!["sent", "delivered", "read", "played", "failed"].includes(status)) {
        throw new Error(`Unsupported Conversation receipt status: ${status}`);
      }
      payload = { ...(actorId ? { actorId } : {}), status };
      identityDetail = JSON.stringify([event.occurredAt, actorId ?? null, status]);
      break;
    }
    default:
      throw new Error("Unsupported Conversation Event kind");
  }
  return {
    id: stableId<"ConversationEventId">(
      "event",
      provider,
      providerAccountId,
      providerConversationId,
      providerMessageId,
      event.kind,
      identityDetail,
    ),
    provider,
    providerAccountId,
    providerConversationId,
    providerMessageId,
    kind: event.kind,
    direction: event.direction,
    occurredAt: event.occurredAt,
    ...(senderId ? { senderId } : {}),
    ...(surfaceId ? { surfaceId } : {}),
    text,
    payload,
  };
}

export function createArchiveSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS archive_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      provider_conversation_id TEXT NOT NULL,
      provider_message_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('arrival', 'edit', 'revocation', 'reaction', 'receipt')),
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      occurred_at_ms INTEGER NOT NULL,
      sender_id TEXT,
      surface_id TEXT REFERENCES surfaces(id),
      text TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS archive_events_no_update
      BEFORE UPDATE ON archive_events BEGIN SELECT RAISE(ABORT, 'archive events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS archive_events_no_delete
      BEFORE DELETE ON archive_events BEGIN SELECT RAISE(ABORT, 'archive events are immutable'); END;
  `);
}

const serialized = (event: ArchivedConversationEvent) => JSON.stringify(event.payload);

interface ArchivedEventRow {
  id: ConversationEventId;
  provider: string;
  provider_account_id: string;
  provider_conversation_id: string;
  provider_message_id: string;
  kind: ArchivedConversationEvent["kind"];
  direction: ArchivedConversationEvent["direction"];
  occurred_at_ms: number;
  sender_id: string | null;
  surface_id: SurfaceId | null;
  text: string;
  payload_json: string;
}

const decodeArchivedEvent = (row: ArchivedEventRow): ArchivedConversationEvent => ({
  id: row.id,
  provider: row.provider,
  providerAccountId: row.provider_account_id,
  providerConversationId: row.provider_conversation_id,
  providerMessageId: row.provider_message_id,
  kind: row.kind,
  direction: row.direction,
  occurredAt: row.occurred_at_ms,
  ...(row.sender_id ? { senderId: row.sender_id } : {}),
  ...(row.surface_id ? { surfaceId: row.surface_id } : {}),
  text: row.text,
  payload: JSON.parse(row.payload_json) as Record<string, unknown>,
});

export function readArchivedEvent(
  database: DatabaseSync,
  eventId: ConversationEventId,
): ArchivedConversationEvent | undefined {
  const row = database
    .prepare("SELECT * FROM archive_events WHERE id = ?")
    .get(eventId) as unknown as ArchivedEventRow | undefined;
  return row ? decodeArchivedEvent(row) : undefined;
}

export function isAdmittedConversationEvent(
  event: ArchivedConversationEvent,
): event is ConversationEvent {
  return (
    event.kind === "arrival" &&
    event.direction === "inbound" &&
    event.surfaceId !== undefined &&
    event.text.length > 0
  );
}

export function archiveEvent(database: DatabaseSync, event: ArchivedConversationEvent) {
  const archived = database
    .prepare(
      `SELECT provider, provider_account_id, provider_conversation_id, provider_message_id,
              kind, direction, occurred_at_ms, sender_id, surface_id, text, payload_json
         FROM archive_events WHERE id = ?`,
    )
    .get(event.id) as Omit<ArchivedEventRow, "id"> | undefined;
  if (archived) {
    assert.deepEqual(
      { ...archived },
      {
        provider: event.provider,
        provider_account_id: event.providerAccountId,
        provider_conversation_id: event.providerConversationId,
        provider_message_id: event.providerMessageId,
        kind: event.kind,
        direction: event.direction,
        occurred_at_ms: event.occurredAt,
        sender_id: event.senderId ?? null,
        surface_id: event.surfaceId ?? null,
        text: event.text,
        payload_json: serialized(event),
      },
      `Conversation Event ${event.id} was replayed with different source evidence`,
    );
    return false;
  }
  database
    .prepare(
      `INSERT INTO archive_events
        (id, provider, provider_account_id, provider_conversation_id, provider_message_id,
         kind, direction, occurred_at_ms, sender_id, surface_id, text, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.id,
      event.provider,
      event.providerAccountId,
      event.providerConversationId,
      event.providerMessageId,
      event.kind,
      event.direction,
      event.occurredAt,
      event.senderId ?? null,
      event.surfaceId ?? null,
      event.text,
      serialized(event),
    );
  return true;
}
