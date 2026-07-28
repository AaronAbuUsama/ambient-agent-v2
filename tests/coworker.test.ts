import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCoworker } from "@ambient-agent/coworker";
import type { SurfaceDeliveryPort } from "@ambient-agent/coworker";

test("the Coworker admits one Conversation Event through one public interface", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ambient-coworker-"));
  const deliveries: Parameters<SurfaceDeliveryPort["deliver"]>[0][] = [];
  try {
    const coworker = createCoworker({
      databasePath: join(directory, "tenant.sqlite"),
      surface: {
        async deliver(effect) {
          deliveries.push(effect);
          return { providerEvidence: `synthetic:${effect.id}` };
        },
      },
    });

    const admission = coworker.admitConversationEvent({
      id: "event_public_interface",
      surfaceId: "surface_public_interface",
      text: "Remember the deployment window",
    });

    assert.equal(admission.eventId, "event_public_interface");
    assert.equal(deliveries.length, 0);
    const result = await coworker.runUntilIdle();
    assert.equal(result.processed, 1);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].text, "Recorded: Remember the deployment window");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
