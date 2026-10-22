#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "tga-content.json"


def read_content():
    if CONTENT.exists():
        try:
            return json.loads(CONTENT.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"approved": {}, "draft": {}, "history": [], "updatedAt": None}


class Handler(SimpleHTTPRequestHandler):
    def _json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self.path = "/Home.html"
            return super().do_GET()
        if path == "/api/tga-content":
            return self._json(read_content())
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path != "/api/tga-content":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return self._json({"ok": False, "error": "invalid json"}, 400)
        if not isinstance(data, dict):
            return self._json({"ok": False, "error": "invalid payload"}, 400)
        payload = {
            "approved": data.get("approved") if isinstance(data.get("approved"), dict) else {},
            "draft": data.get("draft") if isinstance(data.get("draft"), dict) else {},
            "history": data.get("history") if isinstance(data.get("history"), list) else [],
            "updatedAt": data.get("updatedAt"),
        }
        CONTENT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return self._json({"ok": True})


if __name__ == "__main__":
    print("serving http://127.0.0.1:8080/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
