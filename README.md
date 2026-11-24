# internship-dash

internship search dashboard — March 2027, Singapore, BBA profile.

## Run

```bash
python3 app.py
# open http://localhost:8787
```

Binds to `127.0.0.1` only. Default port **8787** (`PORT`/`HOST` env vars override; clear error if busy).
Python 3.8+ standard library only — no pip install needed. Liquid-glass UI, no build step, no CDN.

## Tabs

- **Overview** — KPIs (relevant roles, explicit-March, applied, packets ready, deadlines ≤ 7d, people contacted),
  status donut, family bars, deadline table with days-left pills, blockers.
- **Pipeline** — explicit-March roles + confirm-March leads in one table. Filters: search, **BBA-relevant only**
  (default on; hides tech/IT/cyber/security/engineering/quant roles), **Explicit March only**. Status dropdown per
  row (saved locally), portal links, notes/eligibility flags, CSV export (`/api/export.csv`).
- **Outreach** — one list of people: Name, Company, Position, Why connect, LinkedIn, Status (sent / not sent, editable).
- **About** — search criteria/method, blockers/tasks, run help.

## Files

- `app.py` — stdlib HTTP server (`/`, `/static/*`, `/api/data`, `/api/override`, `/api/export.csv`)
- `static/` — SPA (vanilla JS, inline SVG charts) + `logo.svg` (brand mark, also the favicon)
- `data/*.json` — exported 2026-11-23 from the Drive sheet `AI HQ → Projects → INTERNSHIPSTER → "March 2027 Internships - Singapore"`
  plus `Au MINE IN/SH - lenny` (contacts/outreach). Local edits persist in gitignored `data/overrides.json`.
- `src/` + `parse_sheets.py` — re-export pipeline to refresh `data/*.json` from the Drive sheet
