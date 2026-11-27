#!/usr/bin/env python3
"""Internship HQ — zero-dependency dashboard server.

Serves the SPA from static/ and a JSON API from data/. Syncs live with the
public Google Sheet (Central Internship Tracker) in the background, so edits
in the sheet appear here within ~a minute. Local status overrides persist in
data/overrides.json (gitignored).

Run:  python3 app.py     -> http://127.0.0.1:8787
Env:  PORT, HOST, SHEET_ID, SYNC (0 disables sheet sync), SYNC_INTERVAL (secs)
"""
import csv
import glob
import io
import json
import os
import random
import re
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8787"))

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

SHEET_ID = os.environ.get("SHEET_ID", "1BkjAOfjBnXH_9mGBnU1ICBMGLJaZHH3s")
SHEET_CSV = "https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=" % SHEET_ID
SYNC_ENABLED = os.environ.get("SYNC", "1") == "1"
SYNC_INTERVAL = int(os.environ.get("SYNC_INTERVAL", "60"))

LIVE = {"data": None, "ts": 0.0}  # last successful sheet sync


# ---------- local disk data (offline fallback / cache) ----------

def load(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def load_overrides():
    try:
        with open(os.path.join(DATA_DIR, "overrides.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_overrides(ov):
    with open(os.path.join(DATA_DIR, "overrides.json"), "w", encoding="utf-8") as f:
        json.dump(ov, f, ensure_ascii=False, indent=1)


def ov_key(kind, key, field):
    return "%s:%s:%s" % (kind, key, field)


def apply_keyed(rows, kind, keyfn, field, map_value=None):
    ov = load_overrides()
    for r in rows:
        v = ov.get(ov_key(kind, keyfn(r), field))
        if v is not None:
            r[field] = map_value(v) if map_value else v
    return rows


# ---------- sheet sync ----------

def fetch_sheet_csv(sheet_name):
    url = SHEET_CSV + urllib.parse.quote(sheet_name)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def csv_rows(text):
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return []
    header = [h.strip() for h in rows[0]]
    out = []
    for r in rows[1:]:
        if not any(c.strip() for c in r):
            continue
        d = {}
        for i, h in enumerate(header):
            d[h] = r[i].strip() if i < len(r) else ""
        out.append(d)
    return out


def classify_list(start):
    s = (start or "").lower()
    if "not march" in s or "summer" in s:
        return "Confirm March"
    if re.search(r"mar(ch)?\b|flexible", s):
        return "Explicit March"
    return "Confirm March"


def map_role(r):
    start = r.get("Start (evidence)", "")
    return {
        "Company": r.get("Company", ""),
        "Role": r.get("Role", ""),
        "Family": r.get("Family", ""),
        "Start (March 2027)": start,
        "Start stated": start,
        "Duration": r.get("Duration", ""),
        "Pay (SGD/month)": r.get("Pay (SGD/mo)", ""),
        "Application deadline": r.get("Deadline", ""),
        "Portal link": r.get("Link", ""),
        "Notes / eligibility flags": r.get("Why it fits / what to confirm", ""),
        "Application status": r.get("Status", ""),
        "Score": r.get("Score", ""),
        "Source": r.get("Source", ""),
        "List": classify_list(start),
    }


def map_lead(r):
    return {
        "Company": r.get("Company", ""),
        "Role": r.get("Role", ""),
        "Family": "",
        "Start stated": r.get("Start as stated", ""),
        "Note": r.get("Why it is here", ""),
        "Portal link": r.get("Link", ""),
        "List": "Confirm March",
    }


def normalize_linkedin(v):
    v = (v or "").strip()
    if not v:
        return ""
    if v.lower().startswith("search"):
        m = re.search(r'search\s+"([^"]+)"', v)
        name = m.group(1) if m else v[6:].strip().strip('"')
        return "https://www.linkedin.com/search/results/people/?keywords=" + urllib.parse.quote(name)
    return v.rstrip("/")


def map_person(r):
    return {
        "Name": r.get("Name", ""),
        "Company": r.get("Organisation", ""),
        "Position": r.get("Role / relevance", ""),
        "Relevance": ((r.get("Role / relevance", "") + " — " + r.get("Angle for the message", "")).strip(" —")),
        "LinkedIn": normalize_linkedin(r.get("LinkedIn", "")),
        "Status": "Sent" if r.get("Status", "").upper() == "SENT" else "",
    }


def build_from_sheet(roles, leads, people_rows):
    pipeline = [map_role(r) for r in roles if r.get("Company")] + \
               [map_lead(r) for r in leads if r.get("Company")]
    seen = set()
    people = []
    for r in people_rows:
        if not r.get("Name"):
            continue
        if not r.get("LinkedIn") and not r.get("Status"):
            continue  # section header rows (e.g. "FINTECH / AI / FINANCE — 45 contacts")
        p = map_person(r)
        key = (p["LinkedIn"] or p["Name"]).lower()
        if key in seen:
            continue
        seen.add(key)
        people.append(p)
    return {
        "pipeline": pipeline,
        "people": people,
        "readme": load("readme.json"),
        "holds": load("holds.json"),
        "tasks": load("tasks.json"),
    }


def poller():
    while True:
        try:
            roles = csv_rows(fetch_sheet_csv("ROLES"))
            leads = csv_rows(fetch_sheet_csv("LEADS"))
            people = csv_rows(fetch_sheet_csv("PEOPLE"))
            data = build_from_sheet(roles, leads, people)
            LIVE["data"] = data
            LIVE["ts"] = time.time()
            with open(os.path.join(DATA_DIR, "live_cache.json"), "w", encoding="utf-8") as f:
                json.dump({"ts": LIVE["ts"], "data": data}, f, ensure_ascii=False)
            print("sheet sync OK: %d pipeline, %d people @ %s" % (
                len(data["pipeline"]), len(data["people"]), time.strftime("%H:%M:%S")))
        except Exception as e:
            print("sheet sync failed: %s" % e)
        time.sleep(SYNC_INTERVAL)


# ---------- disk fallback ----------

def build_pipeline():
    explicit = load("pipeline_explicit.json")
    leads = load("pipeline_leads.json")
    for r in explicit:
        r["List"] = "Explicit March"
    for r in leads:
        r["List"] = "Confirm March"
    return explicit + leads


def build_people():
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
        if li not in seen and r.get("PEOPLES"):
            people.append({
                "Name": r.get("PEOPLES", ""),
                "Company": r.get("WHAT", ""),
                "Position": r.get("POSITION + INTEREST", ""),
                "Relevance": r.get("POSITION + INTEREST", ""),
                "LinkedIn": li,
                "Status": "Sent",
            })
    return people


def build_payload_from_disk():
    return {
        "pipeline": build_pipeline(),
        "people": build_people(),
        "readme": load("readme.json"),
        "holds": load("holds.json"),
        "tasks": load("tasks.json"),
    }


def build_payload():
    fresh = LIVE["data"] is not None and (time.time() - LIVE["ts"]) < SYNC_INTERVAL * 3
    if fresh:
        base = LIVE["data"]
        live = True
    else:
        try:
            with open(os.path.join(DATA_DIR, "live_cache.json"), encoding="utf-8") as f:
                cache = json.load(f)
            base = cache["data"]
            live = (time.time() - cache["ts"]) < SYNC_INTERVAL * 6
        except Exception:
            base = build_payload_from_disk()
            live = False
    pipeline_key = lambda r: (r.get("Company", "") + "|" + r.get("Role", "")).strip("|")
    people_key = lambda p: (p.get("LinkedIn") or p.get("Name", "")).strip()
    payload = {
        "pipeline": apply_keyed([dict(r) for r in base["pipeline"]], "pipeline", pipeline_key, "Dashboard status",
                                 lambda v: v),
        "people": apply_keyed([dict(p) for p in base["people"]], "people", people_key, "Status",
                               lambda v: "Sent" if v == "Sent" else ""),
        "readme": base.get("readme", {}),
        "holds": base.get("holds", []),
        "tasks": base.get("tasks", []),
        "live": live,
        "syncedAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(LIVE["ts"] if fresh else
                              (json.load(open(os.path.join(DATA_DIR, "live_cache.json"))).get("ts", 0)
                               if os.path.exists(os.path.join(DATA_DIR, "live_cache.json")) else 0)))
                    if (fresh or os.path.exists(os.path.join(DATA_DIR, "live_cache.json"))) else None,
    }
    return payload


# ---------- backdrops (rotating) ----------

def pick_backdrop():
    files = sorted(glob.glob(os.path.join(STATIC_DIR, "backdrops", "*")))
    files = [f for f in files if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
    if not files:
        return None
    f = random.choice(files)
    return "/static/backdrops/" + os.path.basename(f)


BACKDROP = pick_backdrop()


# ---------- CSV export ----------

def to_csv(rows, fields):
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    return out.getvalue()


# ---------- HTTP ----------

MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json", headers=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/":
            return self._serve_static("index.html")
        if path == "/api/data":
            return self._send(200, json.dumps(build_payload(), ensure_ascii=False))
        if path == "/api/backdrop":
            return self._send(200, json.dumps({"url": BACKDROP}))
        if path == "/api/export.csv":
            rows = build_payload()["pipeline"]
            fields = ["List", "Company", "Role", "Family", "Start (March 2027)", "Start stated",
                      "Duration", "Pay (SGD/month)", "Application deadline", "Portal link",
                      "Notes / eligibility flags", "Note", "Application status"]
            return self._send(200, to_csv(rows, fields), "text/csv; charset=utf-8")
        if path.startswith("/static/"):
            return self._serve_static(path[len("/static/"):])
        return self._send(404, json.dumps({"error": "not found"}))

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/override":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
                kind = body.get("kind")
                key = str(body.get("key", ""))
                field = body.get("field")
                value = body.get("value")
                if kind not in ("pipeline", "people") or not key or not field:
                    raise ValueError("bad request")
                ov = load_overrides()
                ov[ov_key(kind, key, field)] = value
                save_overrides(ov)
                return self._send(200, json.dumps(build_payload(), ensure_ascii=False))
            except Exception as e:
                return self._send(400, json.dumps({"error": str(e)}))
        return self._send(404, json.dumps({"error": "not found"}))

    def _serve_static(self, rel):
        rel = os.path.normpath(rel).lstrip("/\\")
        full = os.path.join(STATIC_DIR, rel)
        if not full.startswith(STATIC_DIR) or not os.path.isfile(full):
            return self._send(404, json.dumps({"error": "not found"}))
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            return self._send(200, f.read(), MIME.get(ext, "application/octet-stream"))


if __name__ == "__main__":
    ThreadingHTTPServer.allow_reuse_address = True
    if SYNC_ENABLED:
        threading.Thread(target=poller, daemon=True).start()
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        print("Could not bind %s:%d (%s)." % (HOST, PORT, e))
        print("Something else is using that port — pick another, e.g.: PORT=9000 python3 app.py")
        raise SystemExit(1)
    print("Internship dashboard running at http://%s:%d" % (HOST, PORT))
    print("Sheet sync: %s (sheet %s, every %ds)" % ("ON" if SYNC_ENABLED else "OFF", SHEET_ID, SYNC_INTERVAL))
    print("Backdrop: %s" % (BACKDROP or "none"))
    server.serve_forever()
