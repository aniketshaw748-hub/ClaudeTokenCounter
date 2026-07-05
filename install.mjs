#!/usr/bin/env node
/**
 * One-command installer for Claude Token Counter.
 *
 *   node install.mjs              install (wire into Claude Code)
 *   node install.mjs --uninstall  remove it again
 *
 * What it does:
 *   1. Adds a `statusLine` block to ~/.claude/settings.json pointing at this
 *      folder's statusline.mjs (your existing settings are preserved and a
 *      .bak backup is written first).
 *   2. Installs the /tokenbar slash command (~/.claude/commands/tokenbar.md).
 *
 * Cross-platform: works on Windows, macOS, and Linux. Node is the only
 * requirement (you already need it for the status line itself).
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATUSLINE = join(ROOT, "statusline.mjs").replaceAll("\\", "/");
const CLAUDE_DIR = join(homedir(), ".claude");
const SETTINGS = join(CLAUDE_DIR, "settings.json");
const COMMANDS_DIR = join(CLAUDE_DIR, "commands");
const COMMAND = join(COMMANDS_DIR, "tokenbar.md");

const STATUSLINE_BLOCK = {
  type: "command",
  command: `node ${STATUSLINE}`,
  padding: 0,
  refreshInterval: 10,
};

const COMMAND_BODY = `---
description: Toggle the token-counter status line layout (compact ⇄ full)
allowed-tools: Bash(node:*)
---

The user wants to flip the Claude token-counter status line between its compact
and full layouts.

New layout: !\`node ${STATUSLINE} toggle\`

Reply in ONE short line stating the new layout (read it from the command output
above) and that it takes effect on the next status-line refresh. Do nothing else.
`;

// ── tiny console helpers ─────────────────────────────────────────────────────
const ok = (s) => console.log(`\x1b[32m✓\x1b[0m ${s}`);
const info = (s) => console.log(`  ${s}`);
const warn = (s) => console.log(`\x1b[33m!\x1b[0m ${s}`);
const fail = (s) => {
  console.error(`\x1b[31m✗\x1b[0m ${s}`);
  process.exit(1);
};

function readSettings() {
  if (!existsSync(SETTINGS)) return {};
  let text;
  try {
    text = readFileSync(SETTINGS, "utf8");
  } catch (e) {
    fail(`Could not read ${SETTINGS}: ${e.message}`);
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(
      `${SETTINGS} is not valid JSON (${e.message}).\n` +
        `  Fix or remove it, then re-run. Nothing was changed.`
    );
  }
}

function backupSettings() {
  if (existsSync(SETTINGS)) {
    copyFileSync(SETTINGS, SETTINGS + ".bak");
    info(`Backed up settings.json → settings.json.bak`);
  }
}

function writeSettings(obj) {
  mkdirSync(CLAUDE_DIR, { recursive: true });
  writeFileSync(SETTINGS, JSON.stringify(obj, null, 2) + "\n");
}

function install() {
  console.log("\nInstalling Claude Token Counter…\n");
  if (!existsSync(STATUSLINE)) {
    fail(`statusline.mjs not found next to the installer (looked in ${ROOT}).`);
  }

  const settings = readSettings();
  backupSettings();

  const already =
    settings.statusLine &&
    settings.statusLine.command === STATUSLINE_BLOCK.command;
  settings.statusLine = STATUSLINE_BLOCK;
  writeSettings(settings);
  ok(already ? "settings.json already pointed here (refreshed)" : "Added statusLine to settings.json");
  info(`command: node ${STATUSLINE}`);

  mkdirSync(COMMANDS_DIR, { recursive: true });
  writeFileSync(COMMAND, COMMAND_BODY);
  ok("Installed /tokenbar slash command");

  console.log(`\n\x1b[32mDone.\x1b[0m Restart Claude Code (or start a new session) to see the meter.`);
  console.log(`Then flip layouts any time with \x1b[1m/tokenbar\x1b[0m.\n`);
}

function uninstall() {
  console.log("\nRemoving Claude Token Counter…\n");
  const settings = readSettings();
  if (settings.statusLine?.command?.includes("statusline.mjs")) {
    backupSettings();
    delete settings.statusLine;
    writeSettings(settings);
    ok("Removed statusLine from settings.json");
  } else if (settings.statusLine) {
    warn("settings.json has a different statusLine — left it untouched.");
  } else {
    info("No statusLine in settings.json.");
  }

  if (existsSync(COMMAND)) {
    rmSync(COMMAND);
    ok("Removed /tokenbar slash command");
  }
  // Leave the mode file (~/.claude/tokenbar-mode) — harmless, remembers choice.
  console.log(`\n\x1b[32mDone.\x1b[0m Restart Claude Code to clear the status line.\n`);
}

const arg = (process.argv[2] || "").toLowerCase();
if (arg === "--uninstall" || arg === "uninstall" || arg === "-u") uninstall();
else install();
