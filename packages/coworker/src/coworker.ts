import { normalizeConversationEvent } from "./archive.js";
import type { ConversationEventInput } from "./archive.js";
import type { SurfaceDeliveryPort } from "./effects.js";
import { runCoworkerSpine } from "./spine.js";

export function createCoworker(options: {
  databasePath: string;
  surface: SurfaceDeliveryPort;
}) {
  return {
    admitConversationEvent(event: ConversationEventInput) {
      return runCoworkerSpine({ ...options, event: normalizeConversationEvent(event) });
    },
  };
}
