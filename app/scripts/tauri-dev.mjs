/**
 * Reserves a free TCP port (default from 1420), writes a merge config for devUrl,
 * sets VITE_DEV_PORT / VITE_DEV_HMR_PORT, then runs `tauri dev --config ...`.
 * Use `bun run tauri:dev` so multiple Tauri+Vite projects can run side by side.
 */
import net from "node:net";
import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const mergePath = path.join(appRoot, "src-tauri", "tauri.dev.merge.json");

function tryListen(port, listenHost = "0.0.0.0") {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.listen({ port, host: listenHost, exclusive: true }, () => {
      srv.close(() => resolve(true));
    });
  });
}

async function findFreePort(start, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const p = start + i;
    if (await tryListen(p)) return p;
  }
  throw new Error(`No free port in range ${start}..${start + attempts - 1}`);
}

function cleanupMerge() {
  try {
    unlinkSync(mergePath);
  } catch {
    // ignore
  }
}

const basePort = Number(process.env.TAURI_VITE_BASE_PORT) || 1420;
const host = process.env.TAURI_DEV_HOST;

const port = await findFreePort(basePort);
let hmrPort;
if (host) {
  hmrPort = await findFreePort(port + 1);
}

const devUrl = host ? `http://${host}:${port}` : `http://localhost:${port}`;

if (host) {
  console.info(`[tauri:dev] devUrl ${devUrl}, HMR port ${hmrPort}`);
} else {
  console.info(`[tauri:dev] devUrl ${devUrl}`);
}

writeFileSync(
  mergePath,
  `${JSON.stringify({ build: { devUrl } }, null, 2)}\n`,
  "utf8"
);

const env = {
  ...process.env,
  VITE_DEV_PORT: String(port),
};
if (hmrPort !== undefined) {
  env.VITE_DEV_HMR_PORT = String(hmrPort);
}

const relMerge = path.join("src-tauri", "tauri.dev.merge.json").replace(/\\/g, "/");

const child = spawn("bun", ["run", "tauri", "dev", "--config", relMerge], {
  cwd: appRoot,
  stdio: "inherit",
  env,
  shell: false,
});

child.on("exit", (code, signal) => {
  cleanupMerge();
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  cleanupMerge();
  console.error(err);
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
