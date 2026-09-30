import { spawnSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/rescript/cli/rescript-tools.js"),
    "reanalyze",
    "-config",
    "-externals",
    "-json",
  ],
  { cwd: root, encoding: "utf8" },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

// Reanalyze reports diagnostics but exits zero even when it finds dead code.
// Parse its native structured output rather than treating that exit as a pass.
const issues = JSON.parse(result.stdout);
if (!Array.isArray(issues)) {
  throw new Error("Expected a ReScript analyzer diagnostic array");
}
for (const issue of issues) {
  const [line, column] = issue.range;
  console.error(
    `${relative(root, issue.file)}:${Math.max(line + 1, 1)}:${Math.max(column + 1, 1)}: ${issue.name}: ${issue.message}`,
  );
}
if (issues.length > 0) {
  process.exitCode = 1;
} else {
  console.log("ReScript analysis: no dead values, types, fields, or unused externals.");
}
