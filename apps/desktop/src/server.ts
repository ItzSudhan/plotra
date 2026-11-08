import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { userInfo } from "node:os";
import path from "node:path";
import { databaseDir, markdownDir, snapshotsDir, type Library } from "./library";
import { FriendlyError } from "./messages";

/**
 * The local server (local-mode-plan.md, "How it works"): the same Next.js
 * server the cloud runs, built in local mode, started on a private port on
 * this computer with the library's database. Electron has Node built in, so
 * the server runs on Electron's own binary (ELECTRON_RUN_AS_NODE).
 */

export type LocalServer = {
  url: string;
  /** Sent by the app's window with every request (apps/app/lib/local-person.ts). */
  token: string;
  /** The server's log file, offered behind "Show details" when something fails. */
  log: string;
  stop: () => Promise<void>;
  /** Asks the server for a snapshot of the database now; resolves to its file name. */
  snapshot: () => Promise<string>;
};

export type ServerPaths = {
  /** The standalone build: holds apps/app/server.js. */
  serverDir: string;
  migrationsDir: string;
  logsDir: string;
};

/** A port that's free now: the preferred one when it is. */
export function freePort(preferred?: number): Promise<number> {
  const tryPort = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", () => {
        const address = probe.address();
        probe.close(() => resolve(typeof address === "object" && address ? address.port : port));
      });
    });
  return preferred ? tryPort(preferred).catch(() => tryPort(0)) : tryPort(0);
}

/** The person's name, for the account local mode makes for them. */
function personName(): string {
  try {
    return userInfo().username;
  } catch {
    return "";
  }
}

/**
 * The program the server runs on. On a Mac, the app's helper: it's the same
 * Electron, but it has no Dock icon, so the server doesn't show up as a second
 * app. Elsewhere, the app's own program (no window or console of its own).
 */
function nodeBinary(): string {
  if (process.platform !== "darwin") return process.execPath;
  const name = path.basename(process.execPath);
  const helper = path.join(path.dirname(process.execPath), "..", "Frameworks", `${name} Helper.app`, "Contents", "MacOS", `${name} Helper`);
  return existsSync(helper) ? helper : process.execPath;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startLocalServer(library: Library, paths: ServerPaths, port: number, extraEnv: Record<string, string> = {}): Promise<LocalServer> {
  const script = path.join(paths.serverDir, "apps", "app", "server.js");
  if (!existsSync(script)) {
    throw new FriendlyError("This copy of Plotra is missing a part it needs to open libraries. Reinstall Plotra from plotra.ink/download and try again.", {
      detail: `${script} is missing.`,
    });
  }
  const url = `http://127.0.0.1:${port}`;
  const token = randomBytes(32).toString("base64url");

  mkdirSync(paths.logsDir, { recursive: true });
  const logFile = path.join(paths.logsDir, "server.log");
  const log = createWriteStream(logFile, { flags: "a" });
  log.write(`\n--- ${new Date().toISOString()} ${library.dir}\n`);

  const child: ChildProcess = spawn(nodeBinary(), [script], {
    cwd: path.dirname(script),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: `pglite:${databaseDir(library.dir)}`,
      PLOTRA_MIGRATIONS_DIR: paths.migrationsDir,
      PLOTRA_LIBRARY: library.dir,
      PLOTRA_MARKDOWN_DIR: markdownDir(library.dir),
      PLOTRA_SNAPSHOTS_DIR: snapshotsDir(library.dir),
      PLOTRA_LOCAL_TOKEN: token,
      PLOTRA_LOCAL_NAME: personName(),
      BETTER_AUTH_SECRET: library.manifest.authSecret,
      BETTER_AUTH_URL: url,
      AI_KEY_SECRET: library.manifest.aiKeySecret,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });

  let exited: number | null = null;
  const exit = new Promise<void>((resolve) => {
    child.once("exit", (code) => {
      exited = code ?? -1;
      resolve();
    });
    // It couldn't be started at all.
    child.once("error", (error) => {
      log.write(`${error.stack ?? error.message}\n`);
      exited ??= -1;
      resolve();
    });
  });

  const local = (pathname: string, init: RequestInit = {}) =>
    fetch(`${url}${pathname}`, { ...init, headers: { ...init.headers, "x-plotra-local": token }, signal: AbortSignal.timeout(30_000) });

  // Ready once it answers with the database open: the first open creates and migrates it, which takes a moment.
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (exited !== null) {
      throw new FriendlyError("Plotra couldn't start the library. Try again, and if it keeps happening, restart your computer.", {
        detail: `The local server stopped while starting (exit code ${exited}).`,
        log: logFile,
      });
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new FriendlyError("The library took too long to open. Try again, and if it keeps happening, restart your computer.", {
        detail: "The local server didn't answer within two minutes.",
        log: logFile,
      });
    }
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) break;
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }

  let stopping: Promise<void> | null = null;
  const stop = () =>
    (stopping ??= (async () => {
      if (exited === null) {
        // Saves what open editors haven't, and closes the database cleanly.
        await local("/api/local/shutdown", { method: "POST" }).catch(() => {});
        child.kill();
        await Promise.race([exit, sleep(5000)]);
        if (exited === null) child.kill("SIGKILL");
      }
      log.end();
    })());

  const snapshot = async () => {
    const res = await local("/api/local/snapshot", { method: "POST" });
    if (!res.ok) {
      throw new FriendlyError("Plotra couldn't save a copy of the library. Try again in a moment.", { detail: `${res.status}: ${await res.text()}`, log: logFile });
    }
    return ((await res.json()) as { file: string }).file;
  };

  return { url, token, log: logFile, stop, snapshot };
}
