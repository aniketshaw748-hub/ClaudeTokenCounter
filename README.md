# Claude Token Counter

A usage meter for the **Claude Code** terminal — the same numbers the desktop
app shows below its prompt box, rendered as a status-line row under your prompt
in every session, automatically.

Two layouts:

```
full     Opus 4.8  │  Session 5% ━─────────── 3h 35m  │  Weekly 83% ━━━━━━━━━━── 3d 9h  │  ctx 8%
compact  S 5% ───── 3h35m   W 83% ━━━━─ 3d9h   ctx 8%
```

- **Session** — usage of the rolling **5-hour** limit window + when it resets
- **Weekly** — usage of the **7-day** limit window + when it resets
- **ctx** — how full the current context window is

Bars use thin horizontal lines (low height, minimal), blue while healthy,
escalating to **amber ≥ 75%** and **red ≥ 90%**.

## Switching layout

The layout is chosen by the first of these that matches:

1. `TOKENBAR_MODE` env var — `compact` or `full` (hard override)
2. `~/.claude/tokenbar-mode` file — flipped by the commands below
3. **auto** — terminal width via `$COLUMNS` (< 100 cols → compact), *if*
   Claude Code exposes it to the script (most setups don't — see note)
4. default → **full**

Flip it any time (takes effect on the next status-line refresh):

```
/tokenbar                                                   # slash command: flip compact ⇄ full
node C:/Coding/ClaudeTokenCounter/statusline.mjs toggle    # flip compact ⇄ full
node C:/Coding/ClaudeTokenCounter/statusline.mjs compact   # pin compact
node C:/Coding/ClaudeTokenCounter/statusline.mjs full       # pin full
node C:/Coding/ClaudeTokenCounter/statusline.mjs auto       # clear pin
```

> **Why not a click button or true auto-resize?** A status line is just stdout
> from a script — Claude Code sends it no click events, and it doesn't pass the
> terminal width in. The script *can't* reliably see the width (stdin JSON has
> none, `$COLUMNS` is unset in the spawned child, there's no TTY), so resize
> auto-switching only works if a future Claude Code sets `$COLUMNS`. The
> `toggle` command is the reliable switch.

## How it works

Claude Code pipes a JSON snapshot of the session to a status-line command on
every render. `statusline.mjs` reads that JSON on stdin and prints one formatted
row. The usage numbers come from these fields
([schema](https://code.claude.com/docs/en/statusline.md)):

| Field | Shown as |
| --- | --- |
| `rate_limits.five_hour.used_percentage` / `.resets_at` | Session % + countdown |
| `rate_limits.seven_day.used_percentage` / `.resets_at` | Weekly % + countdown |
| `context_window.used_percentage` | ctx % |
| `cost.total_cost_usd` | $ cost |

> `rate_limits` is only sent for **Claude.ai Pro/Max** plans, and only **after
> the first API response** of a session. Until then the row shows a "warming
> up" hint plus context/cost. Each window can be independently absent.

## Install

Already wired into `~/.claude/settings.json` (global — applies to every project):

```json
"statusLine": {
  "type": "command",
  "command": "node C:/Coding/ClaudeTokenCounter/statusline.mjs",
  "padding": 0,
  "refreshInterval": 10
}
```

`refreshInterval: 10` re-runs the script every 10s so the "resets in" countdown
stays live even while the session is idle. On Windows, Claude Code runs the
command through Git Bash (with `node` on PATH); the path uses forward slashes as
Git Bash requires. **Restart Claude Code** (or start a new session) to pick it up.

## Preview / develop

No need to launch Claude Code to iterate — the test harness pipes sample
payloads (typical, high-usage, fresh session, only-weekly, malformed) through
the real script:

```
node test.mjs
```

## Customize

Everything lives in `statusline.mjs`:

- **Colours / thresholds** — `CLR` palette and `pctColor()` (the 75% / 90% cutoffs).
- **Bar width** — the `width` argument to `bar()` (default 12 cells; uses 1/8-block partial fills for a smooth edge).
- **Segments** — the `render()` function decides which parts show and in what order; drop `ctx`/`$` or reorder freely.
- **No colour** — respects the `NO_COLOR` environment variable.

## Notes

- The row never crashes the status line: bad JSON or a render error prints a dim
  one-line message instead of breaking your prompt.
- These percentages are computed by Claude Code from **local** session activity
  on this machine; they won't include usage from claude.ai or other devices.
