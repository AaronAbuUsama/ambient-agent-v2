import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { flue } from "@flue/vite";
import { defineConfig } from "vite";

const repositoryRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

export default defineConfig({
  root: repositoryRoot,
  plugins: [
    flue({
      target: "node",
      app: "apps/runtime/src/app.ts",
      db: "apps/runtime/src/db.ts",
      agents: "packages/agents/src/**/*.ts",
      providers: [],
    }),
  ],
  build: {
    emptyOutDir: true,
    outDir: "apps/runtime/dist",
  },
});
