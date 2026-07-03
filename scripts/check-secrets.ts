#!/usr/bin/env bun
// CI guard: fails non-zero if any protected secret env var appears in source outside
// (a) a `Redacted.make(...)` / `Redacted.value(...)` call in the same statement, or
// (b) an allowlisted file (see docs/secret-allowlist.txt).
//
// Run: bun run scripts/check-secrets.ts
//
// This is intentionally a coarse grep - it errs toward false positives the developer
// reviews, not false negatives. The Redacted wrap is looked for across a small line
// window, not just the matched line, so the formatter can wrap a long ternary without
// tripping the guard. If a site legitimately needs an exception, add the file to the
// allowlist with a justification comment.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Glob } from "bun";

const PROTECTED_VARS = [
  "BETTER_AUTH_SECRET",
  "DISCORD_CLIENT_SECRET",
  "DATABASE_AUTH_TOKEN",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "BETTERSTACK_LOGS_TOKEN",
  "BETTERSTACK_OTEL_TOKEN",
  "IP_HASH_HMAC_KEY",
] as const;

// Matches: env.X, process.env.X, process.env["X"], process.env['X']
function makeMatcher(varName: string): RegExp {
  // escape regex meta - vars are uppercase + underscores so no escaping needed in practice,
  // but stay defensive in case the list grows.
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:\\benv\\.${escaped}\\b|\\bprocess\\.env\\.${escaped}\\b|\\bprocess\\.env\\[['"]${escaped}['"]\\])`,
  );
}

const matchers = PROTECTED_VARS.map((v) => ({ name: v, re: makeMatcher(v) }));

const REPO_ROOT = join(import.meta.dir, "..");

async function loadAllowlist(): Promise<Set<string>> {
  const path = join(REPO_ROOT, "docs/secret-allowlist.txt");
  const content = await readFile(path, "utf8");
  const lines = content.split("\n");
  const out = new Set<string>();
  for (const raw of lines) {
    const line = raw.split("#")[0]?.trim();
    if (!line) continue;
    out.add(line);
  }
  return out;
}

function isAcceptedUsage(text: string): boolean {
  // The usage is OK if the surrounding statement ALSO mentions Redacted.make or
  // Redacted.value. Coarse but effective - a legitimate consumer-boundary site
  // has one of these. `text` may be a single line or a small multi-line window
  // (see the caller), which keeps a formatter-wrapped ternary from tripping it.
  return /Redacted\.(make|value)\b/.test(text);
}

/**
 * Skip lines that are clearly comments (not source code). JSDoc continuation lines
 * starting with `*`, line comments starting with `//`, and block-comment opens with
 * `/*` should never trigger the secret guard - they routinely mention env var names
 * in documentation.
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*");
}

interface Violation {
  file: string;
  lineNo: number;
  varName: string;
  text: string;
}

async function main() {
  const allowlist = await loadAllowlist();

  const violations: Violation[] = [];
  const filesScanned: string[] = [];

  // Glob all TS/TSX/MTS files in the workspace, excluding node_modules + dist + build artifacts.
  const glob = new Glob("**/*.{ts,tsx,mts}");
  for await (const file of glob.scan({
    cwd: REPO_ROOT,
    onlyFiles: true,
    dot: false,
  })) {
    // Skip generated/vendored output and lockfile-adjacent dirs
    if (
      file.includes("node_modules/") ||
      file.includes("/dist/") ||
      file.includes(".turbo/") ||
      file.startsWith("dist/") ||
      file.endsWith(".d.ts") ||
      file.endsWith(".d.mts")
    ) {
      continue;
    }

    filesScanned.push(file);

    if (allowlist.has(file)) continue;

    const content = await readFile(join(REPO_ROOT, file), "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;
      for (const { name, re } of matchers) {
        if (re.test(line)) {
          // check the matched line plus the next two, so a Redacted wrap that the
          // formatter pushed onto the following line still counts as accepted.
          const windowText = lines.slice(i, i + 3).join("\n");
          if (!isAcceptedUsage(windowText)) {
            violations.push({ file, lineNo: i + 1, varName: name, text: line.trim() });
          }
        }
      }
    }
  }

  console.log(`Scanned ${filesScanned.length} files; allowlist has ${allowlist.size} entries.`);

  if (violations.length === 0) {
    console.log("PASS: no protected secret env vars read outside Redacted wrappers or allowlist.");
    process.exit(0);
  }

  console.error(`\nFAIL: ${violations.length} unwrapped secret usage(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.lineNo}`);
    console.error(`    var:  ${v.varName}`);
    console.error(`    line: ${v.text}`);
    console.error("");
  }
  console.error(
    "Fix: wrap each site with Redacted.make() at the env read, unwrap with Redacted.value()",
  );
  console.error("at the third-party API handoff. OR add the file to docs/secret-allowlist.txt");
  console.error("with a one-line justification.");
  process.exit(1);
}

main().catch((err) => {
  console.error("check-secrets crashed:", err);
  process.exit(1);
});
