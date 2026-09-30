import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { visitorFromCookie } from "../apps/web/src/server/visitor";
const requireWeb = createRequire(resolve("apps/web/package.json"));
const cli = requireWeb.resolve("next/dist/bin/next");
const secret = "0123456789abcdef0123456789abcdef";
const base = "http://127.0.0.1:3200";
const common = {
  ...process.env,
  NODE_ENV: "production",
  DECISION_COOKIE_SECRET: secret,
  DECISION_PLANNING_GUIDE: "on",
  DECISION_SEASONAL_OFFERS: "",
  DECISION_DISABLED_EXPERIMENTS: "",
};
async function responding(): Promise<boolean> {
  try {
    const response = await fetch(base);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForStartup(child: ChildProcess, getLog: () => string, failure?: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) {
      const log = getLog();
      if (!failure) {
        throw new Error(log);
      }
      assert.notEqual(child.exitCode, 0);
      assert.ok(log.includes(failure), log);
      console.log("Startup rejected:", failure);
      return;
    }
    if (!failure && (await responding())) {
      return;
    }
    await delay(100);
  }
  throw new Error("Startup deadline: " + getLog());
}

async function start(patch: Record<string, string | undefined> = {}, failure?: string) {
  const env: NodeJS.ProcessEnv = { ...common, ...patch };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) {
      delete env[key];
    }
  }
  const child = spawn(
    process.execPath,
    [cli, "start", "--hostname", "127.0.0.1", "--port", "3200"],
    { cwd: resolve("apps/web"), env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const exited = once(child, "exit");
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
    await Promise.race([exited, delay(5000)]);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  };
  try {
    await waitForStartup(child, () => log, failure);
    return { stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
function layouts(html: string) {
  return ["hero-layout", "search-layout", "card-layout", "columns"].map(
    (k) => new RegExp(`data-${k}="([^"]+)"`).exec(html)?.[1],
  );
}
function issued(response: Response) {
  return /visitorId=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];
}
const server = await start();
let oldCookie = "";
try {
  const initial = await fetch(base + "/?country=IN&offers=on&guide=off&exp.arrival-flow=treatment");
  assert.equal(initial.status, 200);
  const header = initial.headers.get("set-cookie")!;
  oldCookie = issued(initial)!;
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=lax/);
  assert.match(header, /Max-Age=31536000/);
  assert.ok(visitorFromCookie(oldCookie, secret));
  const preview = await initial.text();
  assert.equal((preview.match(/class="planning-prompt /g) ?? []).length, 10);
  assert.ok(!preview.includes("Decision inspector"));
  assert.ok(!preview.includes('class="section offers"'));
  assert.ok(!/name="(?:country|offers|guide|exp\.)/.test(preview));
  assert.ok(!/href="[^"]*(?:country=|offers=|guide=|exp\.)/.test(preview));
  for (const path of ["/", "/destinations"]) {
    const r = await fetch(base + path, { headers: { Cookie: "visitorId=" + oldCookie } });
    assert.equal(r.status, 200);
    assert.equal(issued(r), undefined);
    const cache = r.headers.get("cache-control")!;
    assert.match(cache, /private/);
    assert.match(cache, /no-cache|no-store/);
    if (path === "/") {
      assert.deepEqual(layouts(await r.text()), layouts(preview));
    }
    console.log("Production document", path, cache);
  }
  for (const cookie of ["bad", oldCookie.slice(0, -1) + (oldCookie.endsWith("0") ? "1" : "0")]) {
    const r = await fetch(base, { headers: { Cookie: "visitorId=" + cookie } });
    assert.equal(r.status, 200);
    assert.ok(issued(r));
    assert.notEqual(issued(r), cookie);
  }
  for (const path of ["/images/hero-1280.webp", "/image/480/hero-1280.webp"]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type")!, /image\/webp/);
    assert.ok(!/private|no-store/.test(r.headers.get("cache-control")!));
    console.log("Production asset", path, r.headers.get("cache-control"));
  }
  console.log(
    "Production previews ignored; trusted guide visible; signed cookies reused/replaced correctly.",
  );
} finally {
  await server.stop();
}
for (const [patch, error] of [
  [{ DECISION_COOKIE_SECRET: undefined }, "Invalid DECISION_COOKIE_SECRET"],
  [{ DECISION_COOKIE_SECRET: "short" }, "Invalid DECISION_COOKIE_SECRET"],
  [{ DECISION_PLANNING_GUIDE: "off" }, "Invalid DECISION_PLANNING_GUIDE"],
  [{ DECISION_DISABLED_EXPERIMENTS: "unknown-owner" }, "Invalid DECISION_DISABLED_EXPERIMENTS"],
] as const) {
  const s = await start(patch, error);
  await s.stop();
}
const disabled = await start({ DECISION_DISABLED_EXPERIMENTS: "arrival-flow" });
try {
  const html = await (await fetch(base + "/?exp.arrival-flow=treatment")).text();
  assert.deepEqual(layouts(html).slice(0, 3), ["immersive", "overlay", "image"]);
  console.log("Disabled arrival-flow holds defaults without preview reassignment.");
} finally {
  await disabled.stop();
}
const rotated = await start({ DECISION_COOKIE_SECRET: "rotated-0123456789abcdef0123456789abcdef" });
try {
  const r = await fetch(base, { headers: { Cookie: "visitorId=" + oldCookie } });
  assert.equal(r.status, 200);
  assert.ok(issued(r));
  assert.notEqual(issued(r), oldCookie);
  console.log("Secret rotation replaces old cookie.");
} finally {
  await rotated.stop();
}
