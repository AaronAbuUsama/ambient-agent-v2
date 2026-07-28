import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createCoworker } from "@ambient-agent/coworker";
import type { SurfaceDeliveryPort } from "@ambient-agent/coworker";
import {
  createAttestation,
  normalizeConversationEvent,
  syntheticReasoner,
} from "@ambient-agent/coworker/proof";

async function withCoworker(
  run: (context: {
    coworker: ReturnType<typeof createCoworker>;
    deliveries: Parameters<SurfaceDeliveryPort["deliver"]>[0][];
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "ambient-coworker-"));
  const deliveries: Parameters<SurfaceDeliveryPort["deliver"]>[0][] = [];
  const coworker = createCoworker({
    databasePath: join(directory, "tenant.sqlite"),
    reasoner: syntheticReasoner,
    surface: {
      async deliver(effect) {
        deliveries.push(effect);
        return { status: "sent" as const, providerEvidence: `synthetic:${effect.id}` };
      },
    },
  });
  try {
    await run({ coworker, deliveries });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("the application rejects a Scribe quote absent from its source event", () => {
  const event = normalizeConversationEvent({
    id: "event_evidence_boundary",
    surfaceId: "surface_evidence_boundary",
    text: "The deployment window is Tuesday.",
  });
  assert.throws(
    () =>
      createAttestation(event, {
        claim: "The deployment window is Wednesday.",
        confidence: 0.9,
        evidenceQuote: "Wednesday",
      }),
    /exact source evidence/,
  );
});

test("the Coworker admits one normalized Conversation Event through one public interface", async () => {
  await withCoworker(async ({ coworker, deliveries }) => {
    coworker.bindSurface({
      provider: "synthetic",
      providerAccountId: "account_public_interface",
      providerConversationId: "conversation_public_interface",
    });
    const admission = coworker.observeConversationEvent({
      provider: "synthetic",
      providerAccountId: "account_public_interface",
      providerConversationId: "conversation_public_interface",
      providerMessageId: "message_public_interface",
      kind: "arrival",
      direction: "inbound",
      occurredAt: 1_785_235_199_000,
      text: "Remember the deployment window",
    });

    assert.equal(admission.outcome, "admitted");
    assert.equal(deliveries.length, 0);
    const result = await coworker.runUntilIdle();
    assert.equal(result.processed, 1);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].text, "Recorded: Remember the deployment window");
  });
});

test("an event from an unbound provider conversation is archived without Attention", async () => {
  await withCoworker(async ({ coworker, deliveries }) => {
    const receipt = coworker.observeConversationEvent({
      provider: "synthetic",
      providerAccountId: "account_build_3_1",
      providerConversationId: "conversation_unbound",
      providerMessageId: "message_unbound",
      kind: "arrival",
      direction: "inbound",
      occurredAt: 1_785_235_200_000,
      senderId: "participant_unbound",
      text: "This conversation is not authorized.",
    });

    assert.equal(receipt.outcome, "archived");
    assert.match(receipt.eventId, /^event_[a-f0-9]{24}$/);
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 0 });
    assert.equal(deliveries.length, 0);
  });
});

test("a live inbound arrival on a bound Surface is admitted and processed", async () => {
  await withCoworker(async ({ coworker, deliveries }) => {
    const binding = coworker.bindSurface({
      provider: "synthetic",
      providerAccountId: "account_build_3_1",
      providerConversationId: "conversation_bound",
    });
    assert.deepEqual(
      coworker.bindSurface({
        provider: "synthetic",
        providerAccountId: "account_build_3_1",
        providerConversationId: "conversation_bound",
      }),
      binding,
    );

    const receipt = coworker.observeConversationEvent({
      provider: "synthetic",
      providerAccountId: "account_build_3_1",
      providerConversationId: "conversation_bound",
      providerMessageId: "message_bound",
      kind: "arrival",
      direction: "inbound",
      occurredAt: 1_785_235_201_000,
      senderId: "participant_bound",
      text: "Remember this authorized request.",
    });

    assert.equal(receipt.outcome, "admitted");
    if (receipt.outcome !== "admitted") return;
    assert.equal(receipt.surfaceId, binding.surfaceId);
    assert.match(receipt.attentionId, /^attention_[a-f0-9]{24}$/);
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 1 });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].surfaceId, binding.surfaceId);
  });
});

test("binding later does not retroactively admit a previously archived event", async () => {
  await withCoworker(async ({ coworker }) => {
    const event = {
      provider: "synthetic",
      providerAccountId: "account_build_3_1",
      providerConversationId: "conversation_later_bound",
      providerMessageId: "message_before_binding",
      kind: "arrival" as const,
      direction: "inbound" as const,
      occurredAt: 1_785_235_202_000,
      senderId: "participant_later_bound",
      text: "Do not admit this historical observation.",
    };

    const first = coworker.observeConversationEvent(event);
    coworker.bindSurface({
      provider: event.provider,
      providerAccountId: event.providerAccountId,
      providerConversationId: event.providerConversationId,
    });
    const replay = coworker.observeConversationEvent(event);

    assert.equal(first.outcome, "archived");
    assert.deepEqual(replay, first);
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 0 });
  });
});

test("a provider delivery receipt is archived without Attention", async () => {
  await withCoworker(async ({ coworker }) => {
    coworker.bindSurface({
      provider: "synthetic",
      providerAccountId: "account_build_3_1",
      providerConversationId: "conversation_with_receipt",
    });

    const receipt = coworker.observeConversationEvent({
      provider: "synthetic",
      providerAccountId: "account_build_3_1",
      providerConversationId: "conversation_with_receipt",
      providerMessageId: "message_with_receipt",
      kind: "receipt",
      direction: "outbound",
      occurredAt: 1_785_235_203_000,
      senderId: "participant_receipt",
      status: "read",
    });

    assert.equal(receipt.outcome, "archived");
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 0 });
  });
});

test("only useful live inbound arrivals on a bound Surface create Attention", async () => {
  await withCoworker(async ({ coworker }) => {
    const source = {
      provider: "synthetic",
      providerAccountId: "account_admission_rule",
      providerConversationId: "conversation_admission_rule",
      occurredAt: 1_785_235_205_000,
    };
    coworker.bindSurface(source);

    const receipts = [
      coworker.observeConversationEvent({
        ...source,
        providerMessageId: "outbound_arrival",
        kind: "arrival",
        direction: "outbound",
        text: "The Coworker said this.",
      }),
      coworker.observeConversationEvent({
        ...source,
        providerMessageId: "empty_arrival",
        kind: "arrival",
        direction: "inbound",
        text: "   ",
      }),
      coworker.observeConversationEvent({
        ...source,
        providerMessageId: "edit",
        kind: "edit",
        direction: "inbound",
        text: "Edited source evidence.",
      }),
      coworker.observeConversationEvent({
        ...source,
        providerMessageId: "reaction",
        kind: "reaction",
        direction: "inbound",
        emoji: "👍",
        removed: false,
      }),
      coworker.observeConversationEvent({
        ...source,
        providerMessageId: "revocation",
        kind: "revocation",
        direction: "inbound",
      }),
    ];

    assert.deepEqual(
      receipts.map(({ outcome }) => outcome),
      ["archived", "archived", "archived", "archived", "archived"],
    );
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 0 });
  });
});

test("replaying one admitted arrival preserves one Attention item", async () => {
  await withCoworker(async ({ coworker, deliveries }) => {
    const event = {
      provider: "synthetic",
      providerAccountId: "account_replay",
      providerConversationId: "conversation_replay",
      providerMessageId: "message_replay",
      kind: "arrival" as const,
      direction: "inbound" as const,
      occurredAt: 1_785_235_206_000,
      senderId: "participant_replay",
      text: "Process me once.",
    };
    coworker.bindSurface(event);

    const first = coworker.observeConversationEvent(event);
    const replay = coworker.observeConversationEvent(event);

    assert.deepEqual(replay, first);
    assert.throws(
      () => coworker.observeConversationEvent({ ...event, text: "Conflicting replay." }),
      /different source evidence/,
    );
    assert.throws(
      () => coworker.observeConversationEvent({ ...event, senderId: "spoofed_participant" }),
      /different source evidence/,
    );
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 1 });
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 0 });
    assert.equal(deliveries.length, 1);
  });
});

test("Build 2 Archive rows and references survive the Build 3.1 schema migration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ambient-coworker-"));
  const databasePath = join(directory, "tenant.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE archive_events (
      id TEXT PRIMARY KEY,
      surface_id TEXT NOT NULL,
      text TEXT NOT NULL CHECK (length(text) > 0)
    );
    CREATE TABLE attention_items (
      id TEXT PRIMARY KEY,
      source_event_id TEXT NOT NULL UNIQUE REFERENCES archive_events(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'settled'))
    );
    CREATE TABLE knowledge_attestations (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      claim TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence_event_id TEXT NOT NULL REFERENCES archive_events(id),
      evidence_quote TEXT NOT NULL
    );
    INSERT INTO archive_events VALUES (
      'event_legacy',
      'surface_legacy',
      'Preserve this source evidence.'
    );
    INSERT INTO attention_items VALUES ('attention_legacy', 'event_legacy', 'settled');
    INSERT INTO knowledge_attestations VALUES (
      'att_legacy',
      'scribe:synthetic',
      'Preserve this claim.',
      1,
      'event_legacy',
      'Preserve this source evidence.'
    );
  `);
  legacy.close();

  try {
    const coworker = createCoworker({
      databasePath,
      reasoner: syntheticReasoner,
      surface: {
        async deliver(effect) {
          return { status: "sent" as const, providerEvidence: `synthetic:${effect.id}` };
        },
      },
    });
    coworker.bindSurface({
      provider: "synthetic",
      providerAccountId: "account_after_migration",
      providerConversationId: "conversation_after_migration",
    });

    const migrated = new DatabaseSync(databasePath);
    const event = migrated
      .prepare(
        `SELECT id, provider, provider_conversation_id, provider_message_id,
                kind, direction, surface_id, text
           FROM archive_events
          WHERE id = 'event_legacy'`,
      )
      .get();
    assert.deepEqual({ ...event }, {
      id: "event_legacy",
      provider: "synthetic-proof",
      provider_conversation_id: "surface_legacy",
      provider_message_id: "event_legacy",
      kind: "arrival",
      direction: "inbound",
      surface_id: "surface_legacy",
      text: "Preserve this source evidence.",
    });
    assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(
      () =>
        migrated
          .prepare("UPDATE archive_events SET text = 'mutated' WHERE id = 'event_legacy'")
          .run(),
      /archive events are immutable/,
    );
    migrated.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
