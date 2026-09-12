#!/usr/bin/env node
/**
 * Server-backed test runner.
 *
 * Owns the entire lifecycle for tests that need a live application:
 *   1. verify a production build exists (build it if missing)
 *   2. start `next start` on a free port
 *   3. wait for /api/health to answer
 *   4. run the requested node:test directories against it
 *   5. shut the server down — always, including on failure or Ctrl-C
 *
 * Centralising this means no test file ever spawns a server, so a crashed
 * suite cannot leave an orphaned process holding a port.
 *
 * Usage:
 *   node scripts/run-server-tests.mjs tests/api tests/smoke
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

// `node --test` resolves bare directories as modules, so expand any directory
// argument into an explicit glob it understands.
const targets = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("-"))
  .map((arg) => (arg.includes("*") ? arg : `${arg.replace(/\/+$/, "")}/**/*.test.ts`));

if (targets.length === 0) {
  console.error("usage: node scripts/run-server-tests.mjs <test-dir> [...]");
  process.exit(1);
}

const READY_TIMEOUT_MS = 60_000;
const SHUTDOWN_GRACE_MS = 5_000;

/** Ask the OS for a free port by binding to :0 and releasing it. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function exists(relativePath) {
  try {
    await access(path.join(ROOT, relativePath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForReady(baseUrl, child) {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server still booting — retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Server did not become ready within ${READY_TIMEOUT_MS}ms`);
}

/**
 * Terminate the server and everything it spawned.
 *
 * `next start` forks a `next-server` child. Signalling only the wrapper
 * leaves that child orphaned and still holding its port, so the process is
 * started detached (making it a group leader) and the whole group is
 * signalled via the negative pid.
 */
async function stopServer(child) {
  if (!child || child.exitCode !== null) return;

  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // Group already gone; fall back to the direct child.
      try {
        child.kill(signal);
      } catch {
        // Nothing left to signal.
      }
    }
  };

  signalGroup("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), SHUTDOWN_GRACE_MS)),
  ]);

  if (!exited) signalGroup("SIGKILL");
}

async function main() {
  if (!(await exists(".next/BUILD_ID"))) {
    console.log("No production build found — running `next build` first.\n");
    const buildCode = await run("npx", ["next", "build"]);
    if (buildCode !== 0) {
      console.error("\nBuild failed; cannot run server-backed tests.");
      process.exit(buildCode);
    }
  }

  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Starting application on ${baseUrl} ...`);
  const server = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "--port", String(port)],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(port) },
      // Own process group, so teardown can reap the whole tree.
      detached: true,
    },
  );

  // Buffer server output so a boot failure can be shown in context.
  let serverLog = "";
  const capture = (chunk) => {
    serverLog += chunk.toString();
    if (serverLog.length > 20_000) serverLog = serverLog.slice(-20_000);
  };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);

  const cleanup = async () => {
    await stopServer(server);
  };
  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });
  process.on("uncaughtException", async (error) => {
    console.error(error);
    await cleanup();
    process.exit(1);
  });

  let exitCode = 1;
  try {
    await waitForReady(baseUrl, server);
    console.log("Server is ready.\n");

    exitCode = await run(
      "node",
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--test",
        "--test-concurrency=1",
        ...targets,
      ],
      { env: { ...process.env, NB_TEST_BASE_URL: baseUrl } },
    );
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    if (serverLog.trim()) {
      console.error("\n--- server output ---");
      console.error(serverLog.trim().split("\n").slice(-30).join("\n"));
      console.error("---------------------");
    }
  } finally {
    await cleanup();
    console.log("\nServer stopped.");
  }

  process.exit(exitCode);
}

await main();
