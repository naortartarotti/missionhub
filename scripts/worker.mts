import { config } from "dotenv";
config({ path: ".env.local" });
config();

const { runForever, drain } = await import("../src/server/queue/worker");

if (process.argv.includes("--once")) {
  const n = await drain();
  console.info(JSON.stringify({ evt: "worker.drained", processed: n }));
  process.exit(0);
} else {
  await runForever();
}
