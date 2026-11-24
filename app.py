import csv
import io
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
STATIC = os.path.join(BASE, "static")
OVERRIDES = os.path.join(DATA, "overrides.json")
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8787"))

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".csv": "text/csv; charset=utf-8",
    ".ico": "image/x-icon",
}


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def load_overrides():
    if os.path.exists(OVERRIDES):
        with open(OVERRIDES, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_overrides(obj):
    tmp = OVERRIDES + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, OVERRIDES)


def apply_overrides(rows, kind):
    ov = load_overrides()
    for i, row in enumerate(rows):
        for field, val in ov.items():
            if field.startswith("%s:%d:" % (kind, i)):
                row[field.split(":", 2)[2]] = val
    return rows


def build_pipeline():
    explicit = load("pipeline_explicit.json")
    leads = load("pipeline_leads.json")
    for r in explicit:
        r["List"] = "Explicit March"
    for r in leads:
        r["List"] = "Confirm March"
    return apply_overrides(explicit + leads, "pipeline")


def build_people():
    ov = load_overrides()
    sent_by_li = {}
    for row in load("outreach_sent.json") + load("outreach_log.json"):
        li = (row.get("WHERE") or "").rstrip("/")
        is_sent = any(str(v).upper() == "SENT" for v in row.values())
        if li and is_sent:
            sent_by_li[li] = row
    people = []
    seen = set()
    for c in load("contacts.json"):
        li = (c.get("LinkedIn") or "").rstrip("/")
        s = sent_by_li.get(li)
        people.append({
            "Name": c.get("Name", ""),
            "Company": c.get("Company", ""),
            "Position": c.get("Job Title", ""),
            "Relevance": (c.get("Category", "") + (" · " + c.get("List", "") if c.get("List") else "")).strip(" ·"),
            "LinkedIn": li,
            "Status": "Sent" if s else "",
        })
        if li:
            seen.add(li)
    for li, r in sent_by_li.items():
        if li in seen or not r.get("PEOPLES"):
            continue
        li = li.rstrip("/")
        people.append({
            "Name": r.get("PEOPLES", ""),
            "Company": r.get("WHAT", ""),
            "Position": r.get("POSITION + INTEREST", ""),
            "Relevance": r.get("POSITION + INTEREST", ""),
            "LinkedIn": li,
            "Status": "Sent",
        })
    for i, p in enumerate(people):
        v = ov.get("people:%d:Status" % i)
        if v is not None:
            p["Status"] = "Sent" if v == "Sent" else ""
    return people


def build_payload():
    return {
        "pipeline": build_pipeline(),
        "people": build_people(),
        "readme": load("readme.json"),
        "holds": load("holds.json"),
        "tasks": load("tasks.json"),
    }


def to_csv(rows, fields):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/index.html":
            return self._serve_static("index.html")
        if path == "/api/data":
            return self._send_json(build_payload())
        if path == "/api/export.csv":
            rows = build_payload()["pipeline"]
            fields = ["List", "Company", "Role", "Family", "Start (March 2027)", "Start stated", "Duration",
                      "Pay (SGD/month)", "Application deadline", "Portal link",
                      "Notes / eligibility flags", "Note", "Application status"]
            return self._send(200, to_csv(rows, fields), "text/csv; charset=utf-8")
        if path.startswith("/static/"):
            return self._serve_static(path[len("/static/"):])
        self._send_json({"error": "not found"}, 404)

    def _serve_static(self, name):
        name = os.path.normpath(name).lstrip("/\\")
        full = os.path.abspath(os.path.join(STATIC, name))
        if not full.startswith(STATIC + os.sep) or not os.path.isfile(full):
            return self._send_json({"error": "not found"}, 404)
        ext = os.path.splitext(full)[1]
        with open(full, "rb") as f:
            self._send(200, f.read(), MIME.get(ext, "application/octet-stream"))

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/override":
            length = int(self.headers.get("Content-Length", 0))
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                kind = body["kind"]
                index = int(body["index"])
                field = body["field"]
                value = body["value"]
                if kind not in ("pipeline", "people"):
                    raise ValueError("bad kind")
            except Exception:
                return self._send_json({"error": "bad request"}, 400)
            ov = load_overrides()
            ov["%s:%d:%s" % (kind, index, field)] = value
            save_overrides(ov)
            return self._send_json(build_payload())
        self._send_json({"error": "not found"}, 404)


if __name__ == "__main__":
    ThreadingHTTPServer.allow_reuse_address = True
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        print("Could not bind %s:%d (%s)." % (HOST, PORT, e))
        print("Something else is using that port — pick another, e.g.: PORT=9000 python3 app.py")
        raise SystemExit(1)
    print("Internship dashboard running at http://%s:%d" % (HOST, PORT))
    server.serve_forever()
