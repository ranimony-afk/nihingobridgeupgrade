import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.PG_DATA_DIR || "/tmp/disposable-pg-data";
const PORT = parseInt(process.env.PG_PORT || "5432", 10);
const HOST = "127.0.0.1";

async function run() {
  if (fs.existsSync(DATA_DIR) && process.env.PG_CLEAN === "true") {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  const pglite = new PGlite(DATA_DIR);
  await pglite.waitReady;

  const server = createServer(pglite);

  server.listen(PORT, HOST, () => {
    console.log(`[DISPOSABLE-POSTGRES] PGlite server listening on ${HOST}:${PORT} (data: ${DATA_DIR})`);
  });

  process.on("SIGTERM", () => {
    console.log("[DISPOSABLE-POSTGRES] Received SIGTERM, shutting down");
    server.close();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("[DISPOSABLE-POSTGRES] Received SIGINT, shutting down");
    server.close();
    process.exit(0);
  });
}

run().catch((err) => {
  console.error("[DISPOSABLE-POSTGRES] Fatal error:", err);
  process.exit(1);
});
