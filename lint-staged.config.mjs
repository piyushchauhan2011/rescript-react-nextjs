import { basename } from "node:path";

const generatedDirectories =
  /\/(?:node_modules|\.next|\.turbo|lib|test-results|playwright-report)\/|\/drizzle\/meta\//;
const generatedFiles = /\.(?:res\.mjs|gen\.tsx|tsbuildinfo)$/;
const untouchedFiles = new Set(["next-env.d.ts", "pnpm-lock.yaml"]);

function authoredFiles(files) {
  return files.filter(
    (file) =>
      !generatedDirectories.test(file.replaceAll("\\", "/")) &&
      !generatedFiles.test(file) &&
      !untouchedFiles.has(basename(file)),
  );
}

function commands(files, tasks) {
  const authored = authoredFiles(files);
  if (authored.length === 0) {
    return [];
  }
  const fileArguments = authored.map((file) => JSON.stringify(file)).join(" ");
  return tasks.map((task) => task + " " + fileArguments);
}

export default {
  "**/*.{js,jsx,ts,tsx,mjs,cjs}": (files) =>
    commands(files, ["oxfmt --write", "oxlint --deny-warnings"]),
  "**/*.{json,jsonc,yaml,yml,md}": (files) => commands(files, ["oxfmt --write"]),
  "**/*.{res,resi}": (files) => {
    const format = commands(files, ["rescript format"]);
    return format.length === 0 ? [] : [...format, "pnpm res:lint"];
  },
};
