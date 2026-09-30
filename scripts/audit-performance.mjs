import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = join(root, "apps", "web");
const require = createRequire(import.meta.url);
const webRequire = createRequire(join(web, "package.json"));
const nextCli = webRequire.resolve("next/dist/bin/next");
const lighthouseCli = join(dirname(require.resolve("lighthouse/package.json")), "cli/index.js");
const chromePath = chromium.executablePath();
const shutdown = new AbortController();
const signalHandlers = new Map();

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  const handler = () => {
    process.exitCode = exitCode;
    shutdown.abort(new Error(`Audit interrupted by ${signal}`));
  };
  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

// Invoke the actual binaries, not a package-manager shell that could orphan its server.
function startChild(args, options) {
  shutdown.signal.throwIfAborted();
  const grouped = process.platform !== "win32";
  const child = spawn(process.execPath, args, { ...options, detached: grouped });
  let closed = false;
  let spawnError;
  const finished = new Promise((resolve) => {
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, signal) => {
      closed = true;
      shutdown.signal.removeEventListener("abort", interrupt);
      resolve({ code, signal, error: spawnError });
    });
  });
  function kill(signal) {
    if (!child.pid) {
      return;
    }
    try {
      if (grouped) {
        process.kill(-child.pid, signal);
      } else if (!closed) {
        child.kill(signal);
      }
    } catch (error) {
      if (error.code !== "ESRCH") {
        throw error;
      }
    }
  }
  const interrupt = () => kill("SIGTERM");
  shutdown.signal.addEventListener("abort", interrupt, { once: true });
  return {
    child,
    finished,
    get closed() {
      return closed;
    },
    get error() {
      return spawnError;
    },
    async stop() {
      kill("SIGTERM");
      const timeout = new AbortController();
      try {
        await Promise.race([finished, delay(5000, undefined, { signal: timeout.signal })]);
      } finally {
        timeout.abort();
        // Include any worker/browser descendants even if their parent already exited.
        kill("SIGKILL");
      }
      await finished;
    },
  };
}

function serverEnvironment() {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    DECISION_DISABLED_EXPERIMENTS: "arrival-flow,destination-density,planning-guide-detail",
  };
  // Production ignores URL previews. Fix defaults using only trusted rollout configuration.
  delete env.DECISION_SEASONAL_OFFERS;
  delete env.DECISION_PLANNING_GUIDE;
  if (env.DECISION_COOKIE_SECRET === undefined) {
    // This temporary identity secret belongs only to the audit server, never the caller's env.
    env.DECISION_COOKIE_SECRET = randomBytes(32).toString("hex");
  } else if (Buffer.byteLength(env.DECISION_COOKIE_SECRET, "utf8") < 32) {
    throw new Error(
      "DECISION_COOKIE_SECRET must contain at least 32 UTF-8 bytes; unset it to use an audit-only temporary secret.",
    );
  }
  return env;
}

async function ready(url, server, getLog) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    shutdown.signal.throwIfAborted();
    if (
      server.error ||
      server.closed ||
      server.child.exitCode !== null ||
      server.child.signalCode !== null
    ) {
      throw new Error(`Production server exited before becoming ready.\n${getLog()}`, {
        cause: server.error,
      });
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(5000)]),
      });
      await response.body?.cancel();
      if (response.ok) {
        return;
      }
      throw new Error(
        `Production route returned HTTP ${response.status}. Check DB_FILE_NAME and run pnpm db:setup.\n${getLog()}`,
      );
    } catch (error) {
      if (error.cause?.code !== "ECONNREFUSED") {
        throw error;
      }
    }
    await delay(250, undefined, { signal: shutdown.signal });
  }
  throw new Error(`Production server did not start within 30 seconds.\n${getLog()}`);
}

async function audit(url, name, reportDir) {
  const output = join(reportDir, name);
  const child = startChild(
    [
      lighthouseCli,
      url,
      "--preset=desktop",
      "--only-categories=performance",
      "--chrome-flags=--headless=new --no-sandbox",
      "--output=json",
      "--output=html",
      `--output-path=${output}`,
      "--quiet",
    ],
    {
      cwd: root,
      env: { ...process.env, CHROME_PATH: chromePath },
      stdio: "inherit",
    },
  );
  try {
    const result = await child.finished;
    shutdown.signal.throwIfAborted();
    if (result.error) {
      throw result.error;
    }
    if (result.code !== 0) {
      throw new Error(
        `Lighthouse failed for ${url} (exit ${result.code}, signal ${result.signal ?? "none"})`,
      );
    }
    const report = JSON.parse(await readFile(`${output}.report.json`, "utf8"));
    if (report.runtimeError) {
      throw new Error(`Lighthouse could not measure ${url}: ${report.runtimeError.message}`);
    }
    const metric = (id) => report.audits[id]?.displayValue ?? "n/a";
    const score = report.categories.performance.score;
    console.log(
      `${name}: ${score === null ? "n/a" : `${Math.round(score * 100)}/100`} | FCP ${metric("first-contentful-paint")} | LCP ${metric("largest-contentful-paint")} | TBT ${metric("total-blocking-time")} | CLS ${metric("cumulative-layout-shift")}`,
    );
    console.log(`  JSON: ${output}.report.json`);
    console.log(`  HTML: ${output}.report.html`);
  } finally {
    await child.stop();
  }
}

async function main() {
  const env = serverEnvironment();
  try {
    await access(chromePath);
  } catch {
    throw new Error("Playwright Chromium is missing. Run pnpm exec playwright install chromium.");
  }
  try {
    await access(join(web, ".next", "BUILD_ID"));
  } catch {
    throw new Error("The production Next app is not built. Run pnpm build before pnpm perf:audit.");
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const reportDir = join(
    root,
    "test-results",
    "lighthouse",
    new Date().toISOString().replaceAll(":", "-"),
  );
  await mkdir(reportDir, { recursive: true });
  const server = startChild([nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: web,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  const capture = (chunk) => {
    log = (log + chunk.toString()).slice(-8000);
  };
  server.child.stdout.on("data", capture);
  server.child.stderr.on("data", capture);
  try {
    await ready(`${base}/`, server, () => log);
    console.log(
      `Auditing built production pages at ${base} (desktop preset, trusted default decisions)`,
    );
    await audit(`${base}/`, "home", reportDir);
    await audit(`${base}/destinations`, "destinations", reportDir);
    console.log(`Reports: ${reportDir}`);
  } finally {
    await server.stop();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode ||= 1;
  })
  .finally(() => {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
  });
