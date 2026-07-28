import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createFlueClient } from "@flue/sdk";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const operatorToken = "build-1-operator";
const instanceId = "build-1-proof";
const inputMessage = "Prove durable recovery.";
const expectedText = "RECOVERED_ONCE";

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function listen(server) {
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  return server.address().port;
}

async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

function createDeterministicModel() {
  const firstRequest = deferred();
  let requests = 0;

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    for await (const _chunk of request) {
      // Drain the request before simulating the provider.
    }

    requests += 1;
    if (requests === 1) {
      firstRequest.resolve();
      return;
    }

    const base = {
      id: "chatcmpl-recovery-proof",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1_000),
      model: "deterministic",
    };
    const chunks = [
      { ...base, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] },
      {
        ...base,
        choices: [{ index: 0, delta: { content: "RECOVERED_ONCE" }, finish_reason: null }],
      },
      {
        ...base,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ];

    response.writeHead(200, {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    });
    for (const chunk of chunks) {
      response.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  });

  return {
    firstRequest: firstRequest.promise,
    requestCount: () => requests,
    server,
  };
}

function startRuntime({ databasePath, modelPort, port }) {
  const child = spawn(process.execPath, ["apps/runtime/dist/server.mjs"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      AMBIENT_DATABASE_PATH: databasePath,
      AMBIENT_OPERATOR_TOKEN: operatorToken,
      PORT: String(port),
      RECOVERY_MODEL_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => output.push(chunk));
  }
  return { child, output };
}

async function waitForHealth(url, runtime, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (runtime.child.exitCode !== null) {
      throw new Error(`Runtime exited before health check:\n${runtime.output.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // The process has not bound its port yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Runtime did not become healthy:\n${runtime.output.join("")}`);
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise((resolvePromise) => child.once("exit", resolvePromise));
}

async function withTimeout(promise, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rejectPromise) => {
        timeout = setTimeout(() => rejectPromise(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function stop(child, signal = "SIGTERM") {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
    await waitForExit(child);
  }
}

function messageText(message) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

async function executedArtifactFingerprint() {
  const digest = createHash("sha256");
  const runtimeDirectory = resolve(repositoryRoot, "apps/runtime/dist");
  const runtimeFiles = (await readdir(runtimeDirectory, {
    recursive: true,
    withFileTypes: true,
  }))
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort();
  for (const path of [fileURLToPath(import.meta.url), ...runtimeFiles]) {
    digest.update(relative(repositoryRoot, path));
    digest.update(await readFile(path));
  }
  return digest.digest("hex");
}

export async function runRecoveryDemo() {
  const startedAt = new Date();
  const artifactDirectory = resolve(
    repositoryRoot,
    "receipts",
    "build-1",
    startedAt.toISOString().replaceAll(":", "-"),
  );
  const databasePath = resolve(artifactDirectory, "tenant.sqlite");
  const receiptPath = resolve(artifactDirectory, "receipt.json");
  await mkdir(artifactDirectory, { recursive: true });

  const model = createDeterministicModel();
  const modelPort = await listen(model.server);
  const runtimePort = await freePort();
  const healthUrl = `http://127.0.0.1:${runtimePort}/health`;
  const conversationUrl = `http://127.0.0.1:${runtimePort}/agents/recovery/${instanceId}`;
  let firstRuntime;
  let secondRuntime;

  try {
    firstRuntime = startRuntime({ databasePath, modelPort, port: runtimePort });
    const health = await waitForHealth(healthUrl, firstRuntime);
    assert.deepEqual(health, {
      ok: true,
      build: 1,
      runtime: "node",
      persistence: "sqlite",
    });

    const unauthorized = await fetch(conversationUrl);
    assert.equal(unauthorized.status, 401);

    const conversation = createFlueClient({
      url: conversationUrl,
      token: operatorToken,
    });
    const admission = await conversation.send({
      message: { kind: "user", body: inputMessage },
    });

    await withTimeout(model.firstRequest, 15_000, "Model request did not start");
    firstRuntime.child.kill("SIGKILL");
    await waitForExit(firstRuntime.child);
    assert.equal(firstRuntime.child.signalCode, "SIGKILL");

    await stat(databasePath);
    secondRuntime = startRuntime({ databasePath, modelPort, port: runtimePort });
    await waitForHealth(healthUrl, secondRuntime);

    const reply = await conversation.read(admission.submissionId, {
      signal: AbortSignal.timeout(60_000),
    });
    const history = await conversation.history({
      signal: AbortSignal.timeout(10_000),
    });
    const settlement = history.settlements.filter(
      (candidate) =>
        candidate.submissionId === admission.submissionId && candidate.outcome === "completed",
    );
    const assistantMessages = history.messages.filter(
      (message) =>
        message.role === "assistant" && message.submissionId === admission.submissionId,
    );

    assert.equal(reply.submissionId, admission.submissionId);
    assert.equal(reply.text, expectedText);
    assert.equal(settlement.length, 1);
    assert.equal(assistantMessages.length, 1);
    assert.equal(messageText(assistantMessages[0]), expectedText);
    assert.equal(model.requestCount(), 2);

    await stop(secondRuntime.child);
    secondRuntime = undefined;
    const databaseDigest = createHash("sha256")
      .update(await readFile(databasePath))
      .digest("hex");
    const commitResult = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    assert.equal(commitResult.status, 0);
    const statusResult = spawnSync("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    assert.equal(statusResult.status, 0);
    const configurationFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          database: "sqlite",
          model: "recovery-proof/deterministic",
          runtime: "node",
        }),
      )
      .digest("hex");
    const receiptRelativePath = relative(repositoryRoot, receiptPath);
    const receipt = {
      repository: "https://github.com/AaronAbuUsama/ambient-agent-v2",
      commit: commitResult.stdout.trim(),
      workingTreeDirty: statusResult.stdout.trim().length > 0,
      executedArtifactSha256: await executedArtifactFingerprint(),
      build: 1,
      scenario: "durable-flue-node-recovery",
      instanceId,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      environment: "local",
      commands: [
        process.env.npm_lifecycle_event === "test" ? "pnpm test" : "pnpm demo:recovery",
      ],
      configurationFingerprint,
      input: {
        conversationId: instanceId,
        message: inputMessage,
      },
      expectedOutcome: {
        text: expectedText,
        terminalAssistantMessages: 1,
        duplicateTerminalMessages: 0,
      },
      admission: {
        submissionId: admission.submissionId,
        uid: admission.uid,
      },
      interruption: {
        signal: "SIGKILL",
        afterModelRequest: 1,
      },
      restarts: 1,
      outcome: {
        text: reply.text,
        terminalAssistantMessages: assistantMessages.length,
        duplicateTerminalMessages: Math.max(0, assistantMessages.length - 1),
        completedSettlements: settlement.length,
        modelRequests: model.requestCount(),
      },
      artifacts: {
        database: relative(repositoryRoot, databasePath),
        databaseSha256: databaseDigest,
        receipt: receiptRelativePath,
      },
      assertions: {
        completedSettlements: settlement.length === 1,
        databaseSurvivedRestart: true,
        duplicateTerminalMessages: assistantMessages.length - 1 === 0,
        modelRequests: model.requestCount() === 2,
        sameSubmissionSettled: reply.submissionId === admission.submissionId,
        terminalAssistantMessages: assistantMessages.length === 1,
        terminalText: messageText(assistantMessages[0]) === expectedText,
        unauthorizedInspectionRejected: unauthorized.status === 401,
      },
      proof: {
        databaseSurvivedRestart: true,
        sameSubmissionSettled: reply.submissionId === admission.submissionId,
        unauthorizedInspectionRejected: unauthorized.status === 401,
      },
      notProven: [
        "WhatsApp",
        "GitHub",
        "Brain",
        "Scribe",
        "Graph",
        "multi-tenant isolation",
        "production deployment",
      ],
    };

    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } finally {
    await Promise.all([
      firstRuntime ? stop(firstRuntime.child) : undefined,
      secondRuntime ? stop(secondRuntime.child) : undefined,
    ]);
    await new Promise((resolvePromise) => model.server.close(resolvePromise));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const receipt = await runRecoveryDemo();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
