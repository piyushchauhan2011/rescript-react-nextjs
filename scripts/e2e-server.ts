import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryRoot } from "./db-path";

const directory = mkdtempSync(join(tmpdir(), "registry-e2e-"));
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "development",
  DB_FILE_NAME: join(directory, "catalog.db"),
};
// Empty values also prevent Next's .env.local loader from changing browser fixtures.
for (const name of [
  "DECISION_DISABLED_EXPERIMENTS",
  "DECISION_SEASONAL_OFFERS",
  "DECISION_PLANNING_GUIDE",
  "DECISION_COOKIE_SECRET",
]) {
  environment[name] = "";
}

let child: ChildProcess | undefined;
let stopping = false;
let stopPromise: Promise<void> | undefined;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function signalChild(signal: NodeJS.Signals): void {
  if (!child?.pid) {
    return;
  }
  try {
    // pnpm starts Next as a descendant; terminate the entire process group.
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
}

function run(args: string[]): Promise<number> {
  if (stopping) {
    return Promise.resolve(0);
  }
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  child = spawn(pnpm, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => resolve(code ?? (stopping ? 0 : signal ? 1 : 0)));
  return promise;
}

async function stopChild(): Promise<void> {
  const running = child;
  if (running && running.exitCode === null && running.signalCode === null) {
    const exited = Promise.withResolvers<void>();
    running.once("exit", () => exited.resolve());
    signalChild("SIGTERM");
    const deadline = Promise.withResolvers<void>();
    const timer = setTimeout(() => {
      signalChild("SIGKILL");
      deadline.resolve();
    }, 5_000);
    await Promise.race([exited.promise, deadline.promise]);
    clearTimeout(timer);
    await exited.promise;
  }
}

function stop(): Promise<void> {
  stopping = true;
  stopPromise ??= stopChild();
  return stopPromise;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void stop().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}

process.once("exit", () => {
  signalChild("SIGKILL");
  rmSync(directory, { recursive: true, force: true });
});

try {
  const setupCode = await run(["db:setup"]);
  if (setupCode !== 0) {
    throw new Error(`Isolated catalog setup failed (${setupCode})`);
  }
  if (!stopping) {
    const serverCode = await run(["--filter", "@repo/web", "dev", "--port", "3100"]);
    if (!stopping && serverCode !== 0) {
      throw new Error(`Next development server exited (${serverCode})`);
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop();
  rmSync(directory, { recursive: true, force: true });
}
