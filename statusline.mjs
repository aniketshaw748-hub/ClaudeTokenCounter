#!/usr/bin/env node
/**
 * Claude Token Counter — a status-line usage meter for Claude Code.
 *
 * Renders the same numbers the desktop app shows below its prompt box:
 *   Session (5-hour rolling window) and Weekly (7-day) usage, each as a
 *   percentage + slim progress bar + "resets in" countdown, plus the live
 *   context-window fill.
 *
 * Two layouts:
 *   full     Opus 4.8  │  Session 5% ━─────────── 3h 35m  │  Weekly 83% … │ ctx 8%
 *   compact  S 5% ━──── 3h35m   W 83% ━━━── 3d9h   ctx 8%
 *
 * Which layout is chosen (first match wins):
 *   1. TOKENBAR_MODE env var = "compact" | "full"        (hard override)
 *   2. ~/.claude/tokenbar-mode file = "compact" | "full" (flip with: toggle)
 *   3. auto: terminal width via $COLUMNS, if Claude Code exposes it
 *      (< 100 cols → compact); most terminals don't expose it to the script
 *   4. default → full
 *
 * Switch it:
 *   node statusline.mjs toggle     flip between compact/full (writes the file)
 *   node statusline.mjs compact    pin compact
 *   node statusline.mjs full        pin full
 *   node statusline.mjs auto        clear the pin (env/width/default decide)
 *
 * Rate-limit fields (schema: code.claude.com/docs/en/statusline.md):
 *   rate_limits.five_hour.used_percentage / .resets_at   (Session)
 *   rate_limits.seven_day.used_percentage / .resets_at   (Weekly)
 * rate_limits only appears for Claude.ai Pro/Max, and only after the first API
 * response of a session; each window can be independently absent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MODE_FILE = join(homedir(), ".claude", "tokenbar-mode");
const COMPACT_MAX_COLS = 100; // narrower than this → compact (when width is known)

// ── ANSI helpers ────────────────────────────────────────────────────────────
const COLOR = !process.env.NO_COLOR;
const esc = (code) => (COLOR ? `\x1b[${code}m` : "");
const RESET = esc(0);
const dim = (s) => `${esc(2)}${s}${RESET}`;
const fg = (n, s) => `${esc(`38;5;${n}`)}${s}${RESET}`;

// 256-colour palette: blue while healthy, escalate to amber then red.
const CLR = { blue: 39, amber: 214, red: 196, grey: 244, label: 250 };
const pctColor = (p) => (p >= 90 ? CLR.red : p >= 75 ? CLR.amber : CLR.blue);

// ── formatting ──────────────────────────────────────────────────────────────

/** Slim, low-height bar: heavy line for filled, light line for the track. */
function bar(pct, width) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * width);
  return (
    fg(pctColor(p), "━".repeat(filled)) +
    dim("─".repeat(Math.max(0, width - filled)))
  );
}

/** Compact countdown from a unix-epoch reset time: "3h 35m" or tight "3h35m". */
function countdown(resetsAt, tight) {
  if (!resetsAt) return "";
  const rem = Math.floor(Number(resetsAt) - Date.now() / 1000);
  if (!Number.isFinite(rem) || rem <= 0) return "now";
  const d = Math.floor(rem / 86400);
  const h = Math.floor((rem % 86400) / 3600);
  const m = Math.floor((rem % 3600) / 60);
  const sp = tight ? "" : " ";
  if (d > 0) return `${d}d${sp}${h}h`;
  if (h > 0) return `${h}h${sp}${m}m`;
  return `${m}m`;
}

/** One labelled meter: "Session 5% ━──────── 3h 35m". */
function meter(label, pct, resetsAt, { barWidth, tightTime }) {
  if (pct == null || Number.isNaN(Number(pct))) return null;
  const p = Number(pct);
  const shown = p < 10 ? p.toFixed(1).replace(/\.0$/, "") : Math.round(p).toString();
  const reset = countdown(resetsAt, tightTime);
  const resetTxt = reset ? ` ${dim(reset)}` : "";
  return `${fg(CLR.label, label)} ${fg(pctColor(p), `${shown}%`)} ${bar(p, barWidth)}${resetTxt}`;
}

// ── layouts ─────────────────────────────────────────────────────────────────

const LAYOUTS = {
  full: {
    session: "Session",
    weekly: "Weekly",
    barWidth: 12,
    tightTime: false,
    sep: dim("  │  "),
    showModel: true,
  },
  compact: {
    session: "S",
    weekly: "W",
    barWidth: 5,
    tightTime: true,
    sep: dim("   "),
    showModel: false,
  },
};

function render(data, mode) {
  const L = LAYOUTS[mode] || LAYOUTS.full;
  const rl = data.rate_limits || {};
  const ctx = data.context_window || {};
  const modelName = data.model?.display_name;
  const opts = { barWidth: L.barWidth, tightTime: L.tightTime };

  const segments = [];
  const session = meter(L.session, rl.five_hour?.used_percentage, rl.five_hour?.resets_at, opts);
  const weekly = meter(L.weekly, rl.seven_day?.used_percentage, rl.seven_day?.resets_at, opts);
  if (session) segments.push(session);
  if (weekly) segments.push(weekly);

  const ctxPct = ctx.used_percentage;
  if (ctxPct != null && !Number.isNaN(Number(ctxPct))) {
    const p = Math.round(Number(ctxPct));
    segments.push(`${fg(CLR.label, "ctx")} ${fg(pctColor(p), `${p}%`)}`);
  }

  const prefix = L.showModel && modelName ? `${dim(modelName)}${L.sep}` : "";

  // Before the first API response rate_limits is absent — say so rather than
  // render a misleading empty line.
  if (!session && !weekly && segments.length === 0) {
    return `${prefix}${dim("usage warms up after the first reply…")}`;
  }
  return prefix + segments.join(L.sep);
}

// ── mode resolution ─────────────────────────────────────────────────────────

function readModeFile() {
  try {
    const v = readFileSync(MODE_FILE, "utf8").trim().toLowerCase();
    return v === "compact" || v === "full" ? v : null;
  } catch {
    return null;
  }
}

function resolveMode() {
  const env = (process.env.TOKENBAR_MODE || "").trim().toLowerCase();
  if (env === "compact" || env === "full") return env;

  const file = readModeFile();
  if (file) return file;

  // auto: use terminal width only if the environment actually exposes it.
  const cols = parseInt(process.env.COLUMNS || "", 10);
  if (Number.isFinite(cols) && cols > 0) return cols < COMPACT_MAX_COLS ? "compact" : "full";

  return "full"; // safe default when width is unknown
}

// ── CLI: toggle / pin the layout ────────────────────────────────────────────

const cmd = (process.argv[2] || "").toLowerCase();
if (["toggle", "compact", "full", "auto"].includes(cmd)) {
  let next;
  if (cmd === "toggle") next = (readModeFile() || "full") === "compact" ? "full" : "compact";
  else if (cmd === "auto") next = ""; // clear the pin
  else next = cmd;
  writeFileSync(MODE_FILE, next);
  process.stdout.write(
    next ? `token-counter layout → ${next}\n` : "token-counter layout → auto (pin cleared)\n"
  );
  process.exit(0);
}

// ── main: read stdin JSON, print one row ────────────────────────────────────

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let out;
  try {
    out = render(JSON.parse(raw || "{}"), resolveMode());
  } catch (err) {
    out = dim(`token-counter: ${err.message}`);
  }
  process.stdout.write(out + "\n");
});
process.stdin.resume();
