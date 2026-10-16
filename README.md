# token-ledger

See what your Claude Code work costs: tokens and dollars per project, per session, per subagent and per tool call, read from the transcripts Claude Code already keeps in `~/.claude/projects`. Nothing is sent anywhere.

It comes in two parts:

- **`/tokens`**: a pane inside Claude Code (docked beside the transcript in fullscreen). Projects for the last 24h / 3d / 7d / 30d, their sessions, and one session in detail. It refreshes after every turn.
- **`/tokens web`**: a local dashboard at http://127.0.0.1:4610 that refreshes whenever a transcript changes, so after every tool call.

## What it shows

- **Projects**, grouped by git repository: every worktree of a repo counts toward that repo, even after the worktree is deleted. A folder outside git is its own project. List or grid view, with the project's own icon when it has one.
- **Sessions** of a project: title, branch, worktree, model, tool calls, tokens, cost.
- **One session**:
  - a Gantt timeline with one row for the main agent and one per subagent, so you can see subagents running in parallel; idle stretches collapse, and you can zoom to the subagents
  - **where the cost went**: tool calls, the starting context (system prompt, tools, memory files), your messages and injected context, Claude's replies and thinking, subagents. The parts add up to the session total.
  - cost by tool, and every tool call with its own cost, searchable and sortable by cost
  - models per agent, skills used, tokens by type

## Install

At the prompt of a Claude Code session:

```
/plugin install token-ledger --marketplace Maduki-tech/token-ledger
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install token-ledger --marketplace Maduki-tech/token-ledger
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `Maduki-tech/token-ledger`, then Add plugin.

Needs `python3` (standard library only). `/tokens web` opens your browser with `xdg-open` on Linux and `open` on macOS.

## How cost is worked out

Prices are Anthropic's API list prices, kept in `PRICES` in `scripts/usage.py`; on a subscription this is what the same work would cost through the API.

The API bills per request, not per tool call. Each request pays output for what it writes and input for its whole context. The ledger charges every piece of that context (a tool result, your message, the system prompt) for the requests it was part of: at the cache-write rate when it was added, at the cache-read rate on every later request. Those estimates are scaled per request to what the request really cost, so every dollar lands somewhere. When one reply makes several tool calls, its output is split evenly between them.

## Developing

Clone it anywhere and point Claude Code at the folder:

```
claude --plugin-dir /path/to/token-ledger
```

or add the path to `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` so every session loads it. Edits reload the mod when the turn ends.

```
python3 scripts/usage.py selftest   # the cost attribution and grouping
claude plugin test .                 # the pane and /tokens web
claude plugin validate .
```

Files: `hooks/register.tsx` (pane and commands), `scripts/usage.py` (reads transcripts, works out costs), `scripts/server.py` (local web server, binds 127.0.0.1 only), `web/index.html` (the dashboard, no build step).

## License

MIT
