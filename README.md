# internship-dash

internship search dashboard.

## Run

```bash
python3 app.py
# open http://localhost:3000
```

Binds to `127.0.0.1` only (override with `HOST`/`PORT` env vars). Python 3.8+ standard library only — no pip install needed.

## What's inside

- **Overview** — KPIs (explicit March 2027 matches, leads, applied, packets ready, holds, deadlines ≤ 7 days, outreach sent, contacts), status donut, role-family and contact-category charts, deadline table with days-left pills, blockers.
- **Pipeline** — the explicit March 2027 matches: search, family/status filters, deadline countdown, editable status dropdown (saved locally to `data/overrides.json`), portal links, notes/eligibility flags. CSV export at `/api/export.csv`.
- **Leads** — roles where a March start still needs confirming.
- **Outreach** — sent LinkedIn outreach log + SG-50 contact list (search + category filter).
- **Archive** — closed/rejected records with rejection reasons, searchable.
- **About** — search criteria/method, tasks, run instructions.

## Files

- `app.py` — stdlib HTTP server (`/`, `/static/*`, `/api/data`, `/api/override`, `/api/export.csv`)
- `static/` — single-page UI (vanilla JS, inline SVG charts, no CDN)
- `data/*.json` — exported from the Google Drive sheet `AI HQ → Projects → INTERNSHIPSTER → "March 2027 Internships - Singapore"` on 2026-11-23; `data/overrides.json` holds local status edits (gitignored)
- `src/` — raw sheet text exports used by `parse_sheets.py` to rebuild `data/*.json`
- `parse_sheets.py` — re-export helper (re-run after re-reading the Drive sheet to refresh the JSON)
