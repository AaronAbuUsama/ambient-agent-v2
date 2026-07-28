import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { setProvider } from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import { RecoveryAgent } from "@ambient-agent/agents/recovery";

const modelBaseUrl = process.env.RECOVERY_MODEL_BASE_URL;
if (modelBaseUrl === undefined) {
  throw new Error("RECOVERY_MODEL_BASE_URL is required");
}

setProvider(
  createProvider({
    id: "recovery-proof",
    auth: {
      apiKey: {
        name: "Local recovery proof",
        resolve: async () => ({ auth: { apiKey: "local-proof" } }),
      },
    },
    models: [
      {
        id: "deterministic",
        name: "Deterministic recovery proof",
        api: "openai-completions",
        provider: "recovery-proof",
        baseUrl: modelBaseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 16_384,
        maxTokens: 256,
      },
    ],
    api: openAICompletionsApi(),
  }),
);

const operatorToken = process.env.AMBIENT_OPERATOR_TOKEN;
if (operatorToken === undefined) {
  throw new Error("AMBIENT_OPERATOR_TOKEN is required");
}

const app = new Hono();

app.get("/health", (context) =>
  context.json({
    ok: true,
    build: 1,
    runtime: "node",
    persistence: "sqlite",
  }),
);

app.use("/agents/recovery/*", async (context, next) => {
  if (context.req.header("authorization") !== `Bearer ${operatorToken}`) {
    return context.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.route("/agents/recovery", createAgentRouter(RecoveryAgent));

export default app;
