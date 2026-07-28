import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createCoworker } from "@ambient-agent/coworker";
import type { SurfaceDeliveryResult } from "@ambient-agent/coworker";
import {
  normalizeConversationEvent,
  runCoworkerSpine,
  syntheticReasoner,
} from "@ambient-agent/coworker/proof";

async function runDelivery(result: SurfaceDeliveryResult | Error) {
  const directory = await mkdtemp(join(tmpdir(), "ambient-delivery-"));
  const databasePath = join(directory, "tenant.sqlite");
  let attempts = 0;
  const coworker = createCoworker({
    databasePath,
    reasoner: syntheticReasoner,
    surface: {
      async deliver() {
        attempts += 1;
        if (result instanceof Error) throw result;
        return result;
      },
    },
  });
  const source = {
    provider: "synthetic",
    providerAccountId: "account_delivery",
    providerConversationId: "conversation_delivery",
  };
  coworker.bindSurface(source);
  coworker.observeConversationEvent({
    ...source,
    providerMessageId: "message_delivery",
    kind: "arrival",
    direction: "inbound",
    occurredAt: 1_785_235_300_000,
    text: "Send this once.",
  });

  try {
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 1 });
    assert.deepEqual(await coworker.runUntilIdle(), { processed: 0 });
    const database = new DatabaseSync(databasePath);
    const delivery = database
      .prepare("SELECT status, provider_evidence, detail FROM surface_deliveries")
      .get();
    const attention = database
      .prepare(
        `SELECT status, source_event_id, surface_delivery_id
           FROM attention_items
          ORDER BY id`,
      )
      .all();
    database.close();
    return { attempts, delivery: { ...delivery }, attention: attention.map((row) => ({ ...row })) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("sent Surface delivery records provider evidence and creates no new Attention", async () => {
  const outcome = await runDelivery({
    status: "sent",
    providerEvidence: "synthetic:accepted",
  });

  assert.equal(outcome.attempts, 1);
  assert.deepEqual(outcome.delivery, {
    status: "sent",
    provider_evidence: "synthetic:accepted",
    detail: null,
  });
  assert.equal(outcome.attention.length, 1);
  assert.equal(outcome.attention[0].status, "settled");
});

test("failed Surface delivery is terminal and creates new Attention", async () => {
  const outcome = await runDelivery({ status: "failed", detail: "provider rejected send" });

  assert.equal(outcome.attempts, 1);
  assert.deepEqual(outcome.delivery, {
    status: "failed",
    provider_evidence: null,
    detail: "provider rejected send",
  });
  assert.equal(outcome.attention.length, 2);
  assert.equal(outcome.attention.filter(({ status }) => status === "pending").length, 1);
  assert.ok(outcome.attention.some(({ surface_delivery_id }) => surface_delivery_id));
});

test("an indeterminate provider call becomes uncertain and is never retried blindly", async () => {
  const outcome = await runDelivery(new Error("connection lost after send"));

  assert.equal(outcome.attempts, 1);
  assert.deepEqual(outcome.delivery, {
    status: "uncertain",
    provider_evidence: null,
    detail: "connection lost after send",
  });
  assert.equal(outcome.attention.length, 2);
  assert.equal(outcome.attention.filter(({ status }) => status === "pending").length, 1);
  assert.ok(outcome.attention.some(({ surface_delivery_id }) => surface_delivery_id));
});

test("restart from attempting records uncertainty without another provider call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ambient-delivery-restart-"));
  const databasePath = join(directory, "tenant.sqlite");
  let attempts = 0;
  const surface = {
    async deliver() {
      attempts += 1;
      return { status: "sent" as const, providerEvidence: "synthetic:unexpected" };
    },
  };
  const event = normalizeConversationEvent({
    id: "event_delivery_restart",
    surfaceId: "surface_delivery_restart",
    text: "Do not send twice.",
  });

  try {
    await assert.rejects(
      runCoworkerSpine({
        databasePath,
        event,
        surface,
        interrupt(boundary) {
          if (boundary === "delivery-attempting") {
            throw new Error("synthetic process interruption");
          }
        },
      }),
      /synthetic process interruption/,
    );
    assert.equal(attempts, 0);

    await runCoworkerSpine({ databasePath, event, surface });
    await runCoworkerSpine({ databasePath, event, surface });
    assert.equal(attempts, 0);

    const database = new DatabaseSync(databasePath);
    const delivery = database.prepare("SELECT status, detail FROM surface_deliveries").get();
    const deliveryAttention = database
      .prepare(
        `SELECT count(*) AS count
           FROM attention_items
          WHERE status = 'pending' AND surface_delivery_id IS NOT NULL`,
      )
      .get() as { count: number };
    database.close();
    assert.deepEqual({ ...delivery }, {
      status: "uncertain",
      detail: "process interrupted during provider delivery",
    });
    assert.equal(Number(deliveryAttention.count), 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Build 3.1 provider evidence migrates to its Surfaces-owned delivery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ambient-delivery-migration-"));
  const databasePath = join(directory, "tenant.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE surfaces (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status = 'active')
    );
    CREATE TABLE brain_batches (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('open', 'settled'))
    );
    CREATE TABLE effects (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL UNIQUE REFERENCES brain_batches(id),
      type TEXT NOT NULL CHECK (type = 'say'),
      surface_id TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
      provider_evidence TEXT
    );
    INSERT INTO surfaces VALUES ('surface_legacy_delivery', 'active');
    INSERT INTO brain_batches VALUES ('batch_legacy_delivery', 'settled');
    INSERT INTO effects VALUES (
      'effect_legacy_delivery',
      'batch_legacy_delivery',
      'say',
      'surface_legacy_delivery',
      'Already delivered.',
      'completed',
      'synthetic:legacy-accepted'
    );
  `);
  legacy.close();

  try {
    const coworker = createCoworker({
      databasePath,
      reasoner: syntheticReasoner,
      surface: {
        async deliver() {
          return { status: "sent" as const, providerEvidence: "synthetic:unexpected" };
        },
      },
    });
    coworker.bindSurface({
      provider: "synthetic",
      providerAccountId: "account_after_delivery_migration",
      providerConversationId: "conversation_after_delivery_migration",
    });

    const migrated = new DatabaseSync(databasePath);
    const effectColumns = (
      migrated.prepare("PRAGMA table_info(effects)").all() as { name: string }[]
    ).map(({ name }) => name);
    const delivery = migrated
      .prepare(
        `SELECT effect_id, status, provider_evidence
           FROM surface_deliveries
          WHERE effect_id = 'effect_legacy_delivery'`,
      )
      .get();
    assert.equal(effectColumns.includes("provider_evidence"), false);
    assert.deepEqual({ ...delivery }, {
      effect_id: "effect_legacy_delivery",
      status: "sent",
      provider_evidence: "synthetic:legacy-accepted",
    });
    assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
    migrated.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
