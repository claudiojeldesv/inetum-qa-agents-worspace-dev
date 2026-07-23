#!/usr/bin/env node
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

// copilot/hooks/audit-write.ts
import { existsSync as existsSync2, readFileSync } from "node:fs";
import { resolve as resolve2 } from "node:path";

// src/audit-log.ts
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
function defaultLogPath() {
  return resolve(process.cwd(), `${process.env.QA_WORK_DIR || ".work"}/audit-log.json`);
}
function sanitizeLogPath(logPath) {
  const resolved = resolve(process.cwd(), logPath.replace(/\\/g, "/"));
  if (basename(resolved) === "audit-log.json") return { path: resolved };
  return { path: defaultLogPath(), repairedFrom: logPath };
}
function appendAuditEntry(entry, logPath = defaultLogPath()) {
  const { path, repairedFrom } = sanitizeLogPath(logPath);
  const metadata = entry.metadata || repairedFrom ? { ...entry.metadata ?? {}, ...repairedFrom ? { invalid_log_path: repairedFrom } : {} } : void 0;
  const full = {
    timestamp: entry.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
    source: entry.source,
    action: entry.action,
    ...entry.target ? { target: entry.target.replace(/\\/g, "/") } : {},
    ...entry.rule ? { rule: entry.rule } : {},
    ...entry.reason ? { reason: entry.reason } : {},
    ...entry.result ? { result: entry.result } : {},
    ...metadata ? { metadata } : {}
  };
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  appendFileSync(path, JSON.stringify(full) + "\n", { encoding: "utf8" });
  return full;
}

// copilot/hooks/audit-write.ts
async function main() {
  const logPath = resolve2(process.cwd(), ".work/audit-log.json");
  if (!existsSync2(logPath)) {
    appendAuditEntry({
      source: "audit-write",
      action: "invoke",
      result: "pass",
      metadata: { note: "session ended with no prior audit entries" }
    });
    return 0;
  }
  const lines = readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  appendAuditEntry({
    source: "audit-write",
    action: "invoke",
    result: "pass",
    metadata: { total_entries: lines.length, session_closed: true }
  });
  return 0;
}
main().then((code) => process.exit(code)).catch((err) => {
  process.stderr.write(`[audit-write] internal error: ${err}
`);
  process.exit(0);
});
