#!/usr/bin/env python3
"""Token/cost ledger over ~/.claude/projects transcripts.

usage.py projects HOURS          -> per-project totals in the window
usage.py sessions DIR HOURS      -> sessions of one project dir active in the window
usage.py session DIR SID         -> one session in detail (tool calls, subagents, skills)
usage.py selftest
"""
import json, os, subprocess, sys, time
from datetime import datetime

ROOT = os.path.expanduser("~/.claude/projects")
CACHE = os.path.expanduser("~/.cache/token-ledger/repos.json")
# throwaway folders some tools make per call; never a project of yours
HIDDEN = ("t3code-claude-title-",)

# $/1M tokens: input, output, cache read. Cache writes: 5m = 1.25x input, 1h = 2x input.
# ponytail: hand-kept table from the claude-api skill (2026-10-06); edit when prices change.
PRICES = [
    ("claude-fable-5", 10, 50, 0.25),
    ("claude-mythos-5", 10, 50, 0.25),
    ("claude-opus-5-5", 4, 20, 0.20),
    ("claude-opus-5", 5, 25, 0.50),
    ("claude-opus-4", 5, 25, 0.50),
    ("claude-sonnet-5", 2, 10, 0.20),
    ("claude-sonnet-4", 3, 15, 0.30),
    ("claude-haiku-5", 0.10, 0.50, 0.01),
    ("claude-haiku-4", 1, 5, 0.10),
]


def price(model):
    for prefix, i, o, r in PRICES:
        if model.startswith(prefix):
            return i, o, r
    return 0, 0, 0


def cost(model, u):
    i, o, r = price(model)
    cc = u.get("cache_creation") or {}
    w1h = cc.get("ephemeral_1h_input_tokens", 0)
    w5m = u.get("cache_creation_input_tokens", 0) - w1h
    return (u.get("input_tokens", 0) * i + u.get("output_tokens", 0) * o
            + u.get("cache_read_input_tokens", 0) * r + w5m * i * 1.25 + w1h * i * 2) / 1e6


def ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0


def brief(name, inp):
    for k in ("command", "file_path", "path", "pattern", "url", "query", "skill", "description", "prompt"):
        v = inp.get(k)
        if isinstance(v, str) and v:
            return v.splitlines()[0][:120]
    return ""


def ctx(u):
    """Tokens a request sent: everything in its context window."""
    return u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)


def parse(path, agent="main"):
    """One transcript file -> messages (deduped usage) and tool calls, each call with its share of cost.

    A call costs (1) its share of the output of the reply that wrote it, (2) the tokens its result
    added to the next request (that request's context growth, split over the results by size), and
    (3) re-reading that result from cache on every later request.
    """
    msgs, calls, by_id, meta = {}, [], {}, {"title": "", "prompt": "", "cwd": "", "branch": ""}
    reqs = []      # per request, in order: model, usage, the calls it wrote, what was added before it
    pending = []   # (call or None, chars) added to the context since the last request
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            t = e.get("type")
            if t == "ai-title":
                meta["title"] = e.get("aiTitle", "")
            elif t == "last-prompt" and not meta["prompt"]:
                meta["prompt"] = e.get("lastPrompt", "")
            if e.get("cwd") and not meta["cwd"]:
                meta["cwd"] = e["cwd"]
            if e.get("gitBranch"):
                meta["branch"] = e["gitBranch"]
            m = e.get("message") or {}
            if t == "assistant" and isinstance(m.get("usage"), dict):
                key = m.get("id") or e.get("requestId") or e.get("uuid")
                model = m.get("model", "")
                if model == "<synthetic>":
                    continue
                if key not in msgs:
                    reqs.append({"model": model, "u": m["usage"], "calls": [], "before": pending})
                    pending = []
                msgs[key] = (ts(e.get("timestamp", "")), model, m["usage"])
                for b in m.get("content") or []:
                    if b.get("type") == "tool_use":
                        inp = b.get("input") or {}
                        c = {"id": b.get("id"), "ts": ts(e.get("timestamp", "")), "tool": b.get("name", ""),
                             "target": brief(b.get("name", ""), inp), "agent": agent, "error": False, "ms": 0,
                             "input": json.dumps(inp, ensure_ascii=False)[:2000]}
                        if c["tool"] in ("Agent", "Task"):
                            c["subagent"] = inp.get("subagent_type") or "general-purpose"
                        if c["tool"] == "Skill":
                            c["skill"] = inp.get("skill", "")
                        calls.append(c)
                        by_id[c["id"]] = c
                        reqs[-1]["calls"].append(c)
            elif t == "user" and isinstance(m.get("content"), list):
                for b in m["content"]:
                    c = b.get("type") == "tool_result" and by_id.get(b.get("tool_use_id"))
                    if c:
                        c["error"] = bool(b.get("is_error"))
                        c["ms"] = max(0, int((ts(e.get("timestamp", "")) - c["ts"]) * 1000))
                    pending.append((c or None, len(json.dumps(b.get("content", b), ensure_ascii=False))))
            elif t == "attachment":
                pending.append((None, len(line)))
            elif t == "user" and isinstance(m.get("content"), str):
                pending.append((None, len(m["content"])))
                if not meta["prompt"] and not e.get("isMeta") and not m["content"].startswith("<"):
                    meta["prompt"] = m["content"]
    breakdown = attribute(reqs)
    return list(msgs.values()), calls, meta, breakdown


# What a request's context is made of, besides tool calls (keys of the breakdown).
PARTS = {
    "start": "Starting context: system prompt, tool definitions, memory files, first prompt",
    "reply": "Claude's replies and thinking, and re-reading them",
    "user": "Your messages and injected context (reminders, attachments)",
    "compact": "Context after a compaction (summary)",
}


def attribute(reqs):
    """Split every request's real cost over what its context holds; the parts add up to the total.

    A request pays output for what it writes (the tool calls it makes, else "reply"), and input for
    its context: what was added since the last request at the cache-write rate, everything older at
    the cache-read rate. Those estimates are scaled per request to its actual input cost, so cache
    misses and price quirks land on whatever was in the context. Each piece of context is owned by
    the tool call whose result (or output) it is, or by one of PARTS.
    Fills each call's outTok, resultTok, carryTok, cost; returns {part: cost} for the rest.
    """
    parts = {k: 0.0 for k in PARTS}
    charge = lambda owner, usd: parts.__setitem__(owner, parts[owner] + usd) if isinstance(owner, str) \
        else owner.__setitem__("cost", owner["cost"] + usd)
    for rq in reqs:
        for c in rq["calls"]:
            c.update(outTok=0, resultTok=0, carryTok=0, cost=0.0)
    live = []  # (owner, tokens, F and count when it entered)
    F = count = 0.0
    prev = None

    def close(owner, tok, f0, n0):
        charge(owner, tok * (F - f0))
        if not isinstance(owner, str):
            owner["carryTok"] += round(tok * (count - n0))

    for rq in reqs:
        u, (i, o, r) = rq["u"], price(rq["model"])
        out = u.get("output_tokens", 0)
        new = []
        if prev is None:
            new = [("start", ctx(u))]
        elif ctx(u) < 0.6 * ctx(prev["u"]) and ctx(prev["u"]) > 20000:
            for seg in live:
                close(*seg)
            live = []
            new = [("compact", ctx(u))]
        else:
            owners = prev["calls"] or ["reply"]
            new = [(w, prev["u"].get("output_tokens", 0) / len(owners)) for w in owners]
            added = max(0, ctx(u) - ctx(prev["u"]) - prev["u"].get("output_tokens", 0))
            total = sum(n for _, n in rq["before"])
            if not total:
                new.append(("user", added))
            for c, n in rq["before"] if total else []:
                new.append((c or "user", added * n / total))
                if c:
                    c["resultTok"] += round(added * n / total)
        old_tok = sum(tok for _, tok, _, _ in live)
        new_tok = sum(tok for _, tok in new)
        actual_in = cost(rq["model"], u) - out * o / 1e6
        est = (old_tok * r + new_tok * i * 1.25) / 1e6
        scale = actual_in / est if est > 0 else 0
        F += r * scale / 1e6
        count += 1
        for owner, tok in new:
            charge(owner, tok * i * 1.25 * scale / 1e6)
            live.append((owner, tok, F, count))
        owners = rq["calls"] or ["reply"]
        for w in owners:
            charge(w, out * o / 1e6 / len(owners))
            if not isinstance(w, str):
                w["outTok"] += round(out / len(owners))
        prev = rq
    for seg in live:
        close(*seg)
    return parts


def empty():
    return {"input": 0, "output": 0, "cacheWrite": 0, "cacheRead": 0, "total": 0, "cost": 0.0, "requests": 0}


def add(acc, model, u):
    acc["input"] += u.get("input_tokens", 0)
    acc["output"] += u.get("output_tokens", 0)
    acc["cacheWrite"] += u.get("cache_creation_input_tokens", 0)
    acc["cacheRead"] += u.get("cache_read_input_tokens", 0)
    acc["total"] = acc["input"] + acc["output"] + acc["cacheWrite"] + acc["cacheRead"]
    acc["cost"] += cost(model, u)
    acc["requests"] += 1


def session_files(pdir, sid):
    """Main transcript plus its subagent transcripts as (path, agentId, meta)."""
    out = [(os.path.join(pdir, sid + ".jsonl"), "main", {})]
    sub = os.path.join(pdir, sid, "subagents")
    if os.path.isdir(sub):
        for n in sorted(os.listdir(sub)):
            if n.endswith(".jsonl"):
                aid = n[len("agent-"):-len(".jsonl")]
                meta = {}
                try:
                    with open(os.path.join(sub, n[:-6] + ".meta.json")) as f:
                        meta = json.load(f)
                except (OSError, ValueError):
                    pass
                out.append((os.path.join(sub, n), aid, meta))
    return out


def newest_mtime(pdir, sid):
    paths = [os.path.join(pdir, sid + ".jsonl")]
    sub = os.path.join(pdir, sid, "subagents")
    if os.path.isdir(sub):
        paths += [os.path.join(sub, n) for n in os.listdir(sub)]
    return max(os.path.getmtime(p) for p in paths)


def summarize(pdir, sid, since):
    acc, models, first, last, meta, tools = empty(), {}, None, 0, None, 0
    for path, aid, _ in session_files(pdir, sid):
        msgs, calls, m, _ = parse(path, aid)
        if aid == "main":
            meta = m
        tools += sum(1 for c in calls if c["ts"] >= since)
        for t, model, u in msgs:
            first = t if first is None else min(first, t)
            last = max(last, t)
            if t >= since:
                add(acc, model, u)
                models[model] = models.get(model, 0) + cost(model, u)
    return {"id": sid, "title": meta["title"] or meta["prompt"][:80], "cwd": meta["cwd"], "branch": meta["branch"],
            "start": first or 0, "end": last, "tools": tools, "models": sorted(models, key=models.get, reverse=True),
            "usage": acc}


def dir_sessions(dirname, hours):
    pdir = os.path.join(ROOT, dirname)
    since = time.time() - hours * 3600
    out = []
    for n in os.listdir(pdir):
        if not n.endswith(".jsonl"):
            continue
        sid = n[:-6]
        if newest_mtime(pdir, sid) < since:  # untouched since the window opened: nothing in it
            continue
        s = summarize(pdir, sid, since)
        if s["usage"]["requests"]:
            out.append(s)
    return sorted(out, key=lambda s: s["end"], reverse=True)


# Where projects keep their icon, best first (paths relative to the project root).
ICONS = """favicon.svg favicon.png favicon.ico icon.svg icon.png logo.svg logo.png
public/favicon.svg public/favicon.png public/favicon.ico public/icon.svg public/icon.png public/logo.svg
public/logo.png public/apple-touch-icon.png app/icon.svg app/icon.png app/favicon.ico src/app/icon.svg
src/app/icon.png src/app/favicon.ico static/favicon.svg static/favicon.png static/favicon.ico
assets/icon.png assets/logo.svg assets/logo.png .github/logo.svg .github/logo.png docs/logo.svg
src-tauri/icons/icon.png build/icon.png resources/icon.png""".split()


def find_icon(root):
    """Absolute path of the project's icon, or None. Only the fixed names above, at most 1 MB."""
    for rel in ICONS:
        path = os.path.join(root, rel)
        if os.path.isfile(path) and os.path.getsize(path) <= 1_000_000:
            return path
    return None


def git_root(cwd):
    """The main checkout of the repo `cwd` is in (shared by all its worktrees), or None."""
    try:
        out = subprocess.run(["git", "-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
                             capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None
    common = out.stdout.strip()
    if out.returncode or not common:
        return None
    return os.path.dirname(common) if os.path.basename(common) == ".git" else common


def group_of(cwd, roots, cache):
    """Project key for a session folder: its git repo, else the folder itself.

    Worktrees are often deleted after merging, so a resolved repo is cached per folder, and a
    folder that is gone is matched by path: <repo>/.../worktrees/x or .../worktrees/<repo-name>/x.
    """
    if not cwd:
        return None
    if cwd not in cache and os.path.isdir(cwd):
        cache[cwd] = git_root(cwd)
    if cache.get(cwd):
        return cache[cwd]
    parts = cwd.split("/")
    if "worktrees" in parts:
        for root in roots:
            if cwd.startswith(root + "/"):
                return root
        after = parts[parts.index("worktrees") + 1:]
        for root in roots:
            if after and after[0] == os.path.basename(root):
                return root
    return "dir:" + cwd


def load_cache():
    try:
        with open(CACHE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_cache(cache):
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE, "w") as f:
            json.dump(cache, f)
    except OSError:
        pass


def project_keys():
    """{project dir: project key} for every dir under ROOT."""
    cache, cwds = load_cache(), {}
    for d in os.listdir(ROOT):
        pdir = os.path.join(ROOT, d)
        if not os.path.isdir(pdir):
            continue
        cwds[d] = ""
        for n in sorted(os.listdir(pdir)):
            if n.endswith(".jsonl"):
                cwds[d] = first_cwd(os.path.join(pdir, n))
                if cwds[d]:
                    break
    for cwd in cwds.values():  # resolve what still exists first, so gone worktrees can match it
        if cwd and cwd not in cache and os.path.isdir(cwd):
            cache[cwd] = git_root(cwd)
    save_cache(cache)
    roots = sorted({r for r in cache.values() if r}, key=len, reverse=True)
    return {d: group_of(cwd, roots, cache) or "dir:" + d for d, cwd in cwds.items()
            if not os.path.basename(cwd).startswith(HIDDEN)}


def first_cwd(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            if '"cwd"' in line:
                try:
                    return json.loads(line).get("cwd", "")
                except ValueError:
                    pass
            if i > 200:
                return ""
    return ""


def sessions(key, hours, keys=None):
    """Sessions of every dir in project `key`, each tagged with its dir."""
    keys = keys or project_keys()
    out = []
    for d, k in keys.items():
        if k == key:
            for s in dir_sessions(d, hours):
                s["dir"] = d
                out.append(s)
    return sorted(out, key=lambda s: s["end"], reverse=True)


def projects(hours):
    keys = project_keys()
    out = []
    for key in set(keys.values()):
        ss = sessions(key, hours, keys)
        if not ss:
            continue
        acc = empty()
        for s in ss:
            for k in acc:
                acc[k] += s["usage"][k]
        is_git = not key.startswith("dir:")
        path = key if is_git else key[4:]
        out.append({"key": key, "name": os.path.basename(path) or path, "cwd": path, "isGit": is_git,
                    "icon": bool(path and find_icon(path)),
                    "folders": len({s["cwd"] for s in ss if s["cwd"]}), "sessions": len(ss),
                    "last": max(s["end"] for s in ss), "usage": acc})
    return sorted(out, key=lambda p: p["usage"]["cost"], reverse=True)


def cost_of(msgs):
    return sum(cost(model, u) for _, model, u in msgs)


BREAKDOWN = {"tools": "Tool calls of the main agent", "subagents": "Subagents (everything they did)", **PARTS}


def detail(dirname, sid, full=False):
    parts = {}
    pdir = os.path.join(ROOT, dirname)
    agents, calls, models, meta = [], [], {}, None
    total = empty()
    for path, aid, am in session_files(pdir, sid):
        msgs, cs, m, bd = parse(path, aid)
        if aid == "main":
            for k, v in bd.items():
                parts[k] = parts.get(k, 0) + v
            parts["tools"] = sum(c["cost"] for c in cs)
        else:
            parts["subagents"] = parts.get("subagents", 0) + cost_of(msgs)
        if aid == "main":
            meta = m
        acc, used = empty(), {}
        for t, model, u in msgs:
            add(acc, model, u)
            used[model] = used.get(model, 0) + cost(model, u)
            add(total, model, u)
            mm = models.setdefault(model, empty())
            add(mm, model, u)
        times = [t for t, _, _ in msgs] + [c["ts"] for c in cs]
        agents.append({"id": aid, "type": am.get("agentType", "main" if aid == "main" else "subagent"),
                       "description": am.get("description", ""), "toolUseId": am.get("toolUseId", ""),
                       "start": min(times) if times else 0, "end": max(times) if times else 0,
                       "tools": len(cs), "usage": acc, "models": sorted(used, key=used.get, reverse=True)})
        calls += cs
    calls.sort(key=lambda c: c["ts"])
    if not full:  # the pane never shows inputs; keep its stdout small
        for c in calls:
            del c["input"]
    counts, stats = {}, {}
    for c in calls:
        counts[c["tool"]] = counts.get(c["tool"], 0) + 1
        st = stats.setdefault(c["tool"], {"tool": c["tool"], "n": 0, "outTok": 0, "resultTok": 0, "carryTok": 0, "cost": 0.0})
        st["n"] += 1
        for k in ("outTok", "resultTok", "carryTok", "cost"):
            st[k] += c[k]
    skills = {}
    for c in calls:
        if c.get("skill"):
            skills[c["skill"]] = skills.get(c["skill"], 0) + 1
    start = min((a["start"] for a in agents if a["start"]), default=0)
    end = max((a["end"] for a in agents), default=0)
    return {"id": sid, "title": meta["title"], "prompt": meta["prompt"][:400], "cwd": meta["cwd"],
            "branch": meta["branch"], "start": start, "end": end, "usage": total,
            "models": [{"model": k, **v} for k, v in sorted(models.items(), key=lambda kv: -kv[1]["cost"])],
            "agents": agents, "toolCounts": sorted(counts.items(), key=lambda kv: -kv[1]),
            "skills": sorted(skills.items(), key=lambda kv: -kv[1]),
            "toolStats": sorted(stats.values(), key=lambda st: -st["cost"]),
            "breakdown": [{"key": k, "label": BREAKDOWN[k], "cost": v} for k, v in
                          sorted(parts.items(), key=lambda kv: -kv[1]) if v > 0.00005],
            "toolCost": sum(c["cost"] for c in calls),
            "errors": sum(1 for c in calls if c["error"]), "calls": calls}


def stamp():
    """Newest transcript write: changes on every tool call of any session."""
    newest = 0
    for base, _, files in os.walk(ROOT):
        for n in files:
            if n.endswith(".jsonl"):
                newest = max(newest, os.path.getmtime(os.path.join(base, n)))
    return newest


def selftest():
    u = {"input_tokens": 1_000_000, "output_tokens": 1_000_000, "cache_read_input_tokens": 1_000_000,
         "cache_creation_input_tokens": 2_000_000, "cache_creation": {"ephemeral_1h_input_tokens": 1_000_000}}
    # opus 5.5: 4 + 20 + 0.2 + 5 (5m) + 8 (1h)
    assert abs(cost("claude-opus-5-5", u) - 37.2) < 1e-9, cost("claude-opus-5-5", u)
    assert price("claude-haiku-4-5-20251001") == (1, 5, 0.10)
    assert price("claude-opus-5") == (5, 25, 0.50) and price("claude-opus-5-5")[0] == 4
    assert price("unknown") == (0, 0, 0)
    import tempfile
    d = tempfile.mkdtemp()
    rows = [
        {"type": "user", "cwd": "/x/proj", "message": {"role": "user", "content": "hi"}},
        {"type": "assistant", "timestamp": "2026-01-01T00:00:00Z", "message": {"id": "m1", "model": "claude-opus-5-5",
         "usage": {"input_tokens": 10, "output_tokens": 5}, "content": [{"type": "tool_use", "id": "t1", "name": "Skill", "input": {"skill": "tdd"}}]}},
        # same message id repeats its usage per content block: must count once
        {"type": "assistant", "timestamp": "2026-01-01T00:00:01Z", "message": {"id": "m1", "model": "claude-opus-5-5",
         "usage": {"input_tokens": 10, "output_tokens": 5}, "content": [{"type": "tool_use", "id": "t2", "name": "Agent", "input": {"subagent_type": "Explore"}}]}},
        {"type": "user", "timestamp": "2026-01-01T00:00:03Z", "message": {"content": [{"type": "tool_result", "tool_use_id": "t2", "is_error": True}]}},
    ]
    with open(os.path.join(d, "s.jsonl"), "w") as f:
        f.write("\n".join(json.dumps(r) for r in rows) + "\nnot json\n")
    msgs, calls, meta, _ = parse(os.path.join(d, "s.jsonl"))
    assert len(msgs) == 1 and len(calls) == 2 and meta["cwd"] == "/x/proj" and meta["prompt"] == "hi"
    assert calls[1]["error"] and calls[1]["ms"] == 2000 and calls[1]["subagent"] == "Explore" and calls[0]["skill"] == "tdd"
    # attribution: r1 writes t1 (out 100); its 4000-char result grows r2's context by 1000 - 100 out = 900;
    # two more requests follow, so it is re-read from cache twice
    rows = [
        {"type": "assistant", "timestamp": "2026-01-01T00:00:00Z", "message": {"id": "r1", "model": "claude-opus-5-5",
         "usage": {"input_tokens": 1000, "output_tokens": 100}, "content": [{"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "ls"}}]}},
        {"type": "user", "timestamp": "2026-01-01T00:00:01Z", "message": {"content": [{"type": "tool_result", "tool_use_id": "t1", "content": "x" * 4000}]}},
        {"type": "assistant", "message": {"id": "r2", "model": "claude-opus-5-5", "usage": {"input_tokens": 2000, "output_tokens": 10}, "content": []}},
        {"type": "assistant", "message": {"id": "r3", "model": "claude-opus-5-5", "usage": {"input_tokens": 2010, "output_tokens": 10}, "content": []}},
        {"type": "assistant", "message": {"id": "r4", "model": "claude-opus-5-5", "usage": {"input_tokens": 2020, "output_tokens": 10}, "content": []}},
    ]
    with open(os.path.join(d, "a.jsonl"), "w") as f:
        f.write("\n".join(json.dumps(r) for r in rows))
    msgs, calls, _, parts = parse(os.path.join(d, "a.jsonl"))
    c = calls[0]
    assert (c["outTok"], c["resultTok"], c["carryTok"]) == (100, 900, 2000), c  # result + its own call, re-read twice
    # every dollar lands somewhere: the call plus the parts equal what the requests cost
    assert abs(c["cost"] + sum(parts.values()) - cost_of(msgs)) < 1e-12, (c["cost"], parts, cost_of(msgs))
    assert parts["start"] > 0 and parts["reply"] > 0 and c["cost"] > 100 * 20 / 1e6

    roots = ["/r/shop", "/r/blog"]
    assert group_of("/x/gone/worktrees/shop/feat-a", roots, {}) == "/r/shop"
    assert group_of("/r/shop/.claude/worktrees/dav-1", roots, {}) == "/r/shop"
    assert group_of("/x/notes", roots, {}) == "dir:/x/notes"
    assert group_of("/x/wt", roots, {"/x/wt": "/r/blog"}) == "/r/blog"
    print("ok")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "selftest":
        selftest()
    else:
        res = {"projects": lambda: projects(float(sys.argv[2])),
               "sessions": lambda: sessions(sys.argv[2], float(sys.argv[3])),
               "session": lambda: detail(sys.argv[2], sys.argv[3])}[cmd]()
        json.dump(res, sys.stdout, separators=(",", ":"))
