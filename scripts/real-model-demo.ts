import { fileURLToPath } from "node:url";

import { runRealModelDemo } from "../apps/runtime/src/real-model-demo.js";

export { runRealModelDemo };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runRealModelDemo(), null, 2)}\n`);
}
