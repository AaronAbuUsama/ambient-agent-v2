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

const status = await readFile(join(root, "STATUS.md"), "utf8");
assert.match(status, /Designed, not built/, "STATUS.md must distinguish design from implementation");
assert.match(status, /Explicitly absent/, "STATUS.md must state its negative proof boundary");

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
