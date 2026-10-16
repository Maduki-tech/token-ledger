#!/usr/bin/env python3
"""Local web view of the token ledger: http://127.0.0.1:4610

Serves web/index.html and a JSON API over usage.py. Binds localhost only.
Exits quietly when the port is taken (an earlier server is still running).
"""
import json, os, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(__file__))
import usage  # noqa: E402

PORT = int(os.environ.get("TOKEN_LEDGER_PORT", "4610"))
INDEX = os.path.join(os.path.dirname(__file__), "..", "web", "index.html")


def name(q, key):
    """A project dir or session id from the query: one path segment, nothing else."""
    v = (q.get(key) or [""])[0]
    if not v or v != os.path.basename(v) or v in (".", ".."):
        raise ValueError(f"bad {key}")
    return v


def project(q):
    """A project key the ledger itself produced: an allow-list, never a path to open."""
    v = (q.get("project") or [""])[0]
    if v not in set(usage.project_keys().values()):
        raise ValueError("unknown project")
    return v


def hours(q):
    return min(max(float((q.get("h") or ["24"])[0]), 1), 24 * 365)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        try:
            if url.path == "/":
                with open(INDEX, "rb") as f:
                    return self.send(200, f.read(), "text/html; charset=utf-8")
            if url.path == "/api/icon":
                icon = usage.find_icon(project(q).removeprefix("dir:"))
                if not icon:
                    return self.send(404, b'{"error":"no icon"}')
                ctype = {".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}[os.path.splitext(icon)[1]]
                with open(icon, "rb") as f:
                    return self.send(200, f.read(), ctype)
            body = {
                "/api/stamp": lambda: {"stamp": usage.stamp()},
                "/api/projects": lambda: usage.projects(hours(q)),
                "/api/sessions": lambda: usage.sessions(project(q), hours(q)),
                "/api/session": lambda: usage.detail(name(q, "dir"), name(q, "sid"), full=True),
            }.get(url.path)
            if body is None:
                return self.send(404, b'{"error":"not found"}')
            self.send(200, json.dumps(body(), separators=(",", ":")).encode())
        except (ValueError, FileNotFoundError) as err:
            self.send(400, json.dumps({"error": str(err)}).encode())

    def send(self, code, data, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "max-age=300" if ctype.startswith("image/") else "no-store")
        # an SVG opened on its own must not run scripts on this origin
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'" if ctype.startswith("image/")
                         else "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        sys.exit(0)  # already running
    server.serve_forever()
