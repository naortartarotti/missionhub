// Worker-thread entry for the claim-evidence scan (N1). The parent (claim-evidence.ts) transfers the
// bytes, enforces a hard wall-clock timeout and terminates this thread on expiry, so no input can
// stall the queue worker. Plain ESM so it loads the same way under tsx, vitest and plain node.
import { parentPort, workerData } from "node:worker_threads";
import { evidenceVerdict } from "./pdf-scan.mjs";

const { buffer, mime, declaredSize, scanBudgetMs } = workerData;
parentPort.postMessage(evidenceVerdict(new Uint8Array(buffer), mime, declaredSize, scanBudgetMs));
