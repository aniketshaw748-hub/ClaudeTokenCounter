#!/usr/bin/env node
/**
 * Preview the status line against sample payloads without launching Claude Code.
 * Run: node test.mjs
 * Pipes each sample JSON into statusline.mjs and prints the rendered row.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "statusline.mjs");
const now = Math.floor(Date.now() / 1000);

const samples = {
  "typical (matches the screenshot)": {
    model: { display_name: "Opus 4.8" },
    rate_limits: {
      five_hour: { used_percentage: 5, resets_at: now + 3 * 3600 + 35 * 60 },
      seven_day: { used_percentage: 83, resets_at: now + 3 * 86400 + 9 * 3600 },
    },
    context_window: { used_percentage: 8 },
    cost: { total_cost_usd: 0.42 },
  },
  "high usage (colour escalation)": {
    model: { display_name: "Opus 4.8" },
    rate_limits: {
      five_hour: { used_percentage: 78.4, resets_at: now + 42 * 60 },
      seven_day: { used_percentage: 96, resets_at: now + 5 * 3600 },
    },
    context_window: { used_percentage: 91 },
    cost: { total_cost_usd: 12.7 },
  },
  "fresh session (rate_limits absent)": {
    model: { display_name: "Sonnet" },
    context_window: { used_percentage: null },
  },
  "only weekly present": {
    model: { display_name: "Haiku" },
    rate_limits: { seven_day: { used_percentage: 12, resets_at: now + 6 * 86400 } },
    context_window: { used_percentage: 3 },
  },
  "malformed json": "{ this is not valid",
};

for (const [name, payload] of Object.entries(samples)) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  process.stdout.write(`\n  ${name}\n`);
  for (const mode of ["full", "compact"]) {
    const r = spawnSync(process.execPath, [script], {
      input,
      encoding: "utf8",
      env: { ...process.env, TOKENBAR_MODE: mode },
    });
    process.stdout.write(`    ${mode.padEnd(8)}` + (r.stdout || r.stderr || "(no output)"));
  }
}
process.stdout.write("\n");
