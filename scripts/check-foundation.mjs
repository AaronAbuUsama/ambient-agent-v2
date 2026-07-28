import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  "AGENTS.md",
  "README.md",
  "STATUS.md",
  "docs/ARCHITECTURE.md",
  "docs/BUILD-PLAN.md",
  "docs/CUTOVER.md",
  "docs/DOMAIN.md",
  "docs/ENVIRONMENTS.md",
  "docs/EVALS.md",
  "docs/PROOF-CONTRACT.md",
  "docs/decisions/0001-clean-replacement-repository.md",
  "docs/decisions/0002-node-local-first.md",
  "docs/decisions/0003-one-tenant-database.md",
  "docs/decisions/0004-control-plane-runtime-boundary.md",
];

await Promise.all(required.map((path) => access(join(root, path))));

const buildPlan = await readFile(join(root, "docs/BUILD-PLAN.md"), "utf8");
for (let build = 0; build <= 5; build += 1) {
  assert.match(buildPlan, new RegExp(`Build ${build}\\b`), `Build ${build} is absent from the build plan`);
}
assert.match(buildPlan, /Production cutover/, "The production cutover is absent from the build plan");

const architecture = await readFile(join(root, "docs/ARCHITECTURE.md"), "utf8");
for (const law of ["packages/coworker", "packages/agents", "apps/runtime", "apps/control-plane"]) {
  assert.ok(architecture.includes(law), `${law} is absent from the target architecture`);
}

const dependencyLaws = [
  {
    packageRoot: "packages/coworker",
    sourceRoot: "packages/coworker/src",
    allowedRuntimeDependencies: [],
    allowedImports: ["node:assert/strict", "node:crypto", "node:sqlite"],
  },
  {
    packageRoot: "packages/agents",
    sourceRoot: "packages/agents/src",
    allowedRuntimeDependencies: ["@ambient-agent/coworker", "@flue/runtime"],
    allowedImports: ["@flue/runtime"],
  },
  {
    packageRoot: "apps/runtime",
    sourceRoot: "apps/runtime/src",
    allowedRuntimeDependencies: [
      "@ambient-agent/agents",
      "@ambient-agent/coworker",
      "@earendil-works/pi-ai",
      "@flue/runtime",
      "hono",
    ],
    allowedImports: [
      "@ambient-agent/agents",
      "@ambient-agent/coworker",
      "@earendil-works/pi-ai",
      "@flue/runtime",
      "hono",
    ],
  },
  {
    packageRoot: "evals",
    sourceRoot: "evals/src",
    allowedRuntimeDependencies: ["@ambient-agent/coworker", "braintrust"],
    allowedImports: [
      "@ambient-agent/coworker",
      "braintrust",
      "node:fs/promises",
      "node:url",
    ],
  },
];
const runtimeDependencyBuckets = ["dependencies", "optionalDependencies", "peerDependencies"];
const importPatterns = [
  /(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/gu,
  /import\s*\(\s*["']([^"']+)["']\s*\)/gu,
];
const packageName = (specifier) =>
  specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/", 1)[0];

for (const law of dependencyLaws) {
  const manifest = JSON.parse(await readFile(join(root, law.packageRoot, "package.json"), "utf8"));
  const runtimeDependencies = new Set(
    runtimeDependencyBuckets.flatMap((bucket) => Object.keys(manifest[bucket] ?? {})),
  );
  for (const dependency of runtimeDependencies) {
    assert.ok(
      law.allowedRuntimeDependencies.includes(dependency),
      `${law.packageRoot} runtime dependency ${dependency} violates its allowlist`,
    );
  }
  const files = (await readdir(join(root, law.sourceRoot), { recursive: true })).filter((path) =>
    /\.(?:mjs|ts)$/u.test(path),
  );
  for (const path of files) {
    const source = await readFile(join(root, law.sourceRoot, path), "utf8");
    const imports = importPatterns.flatMap((pattern) =>
      [...source.matchAll(pattern)].map((match) => match[1]),
    );
    for (const specifier of imports) {
      assert.ok(
        specifier.startsWith(".") ||
          law.allowedImports.some(
            (allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`),
          ),
        `${join(law.sourceRoot, path)} imports non-allowlisted ${specifier}`,
      );
      if (!specifier.startsWith(".") && !specifier.startsWith("node:")) {
        assert.ok(
          runtimeDependencies.has(packageName(specifier)),
          `${join(law.sourceRoot, path)} imports undeclared runtime dependency ${specifier}`,
        );
      }
    }
  }
}

const status = await readFile(join(root, "STATUS.md"), "utf8");
assert.match(status, /Designed, not built/, "STATUS.md must distinguish design from implementation");
assert.match(status, /Not proven/, "STATUS.md must state its negative proof boundary");

const docs = (await readdir(join(root, "docs"), { recursive: true }))
  .filter((path) => path.endsWith(".md"))
  .map((path) => join("docs", path));
const markdown = ["AGENTS.md", "README.md", "STATUS.md", ...docs];
for (const path of markdown) {
  const source = await readFile(join(root, path), "utf8");
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^(?:https?:|#)/.test(href)) continue;
    const target = href.split("#", 1)[0];
    await access(join(root, dirname(path), target));
  }
}

console.log(
  `Repository canon is coherent: ${required.length} canonical artifacts and ${markdown.length} Markdown files checked.`,
);
