# internship-dash

internship search dashboard — March 2027, Singapore, BBA profile.

## Run

```bash
python3 app.py
# open http://localhost:8787
```

Binds to `127.0.0.1` only. Default port **8787** (`PORT`/`HOST` env vars override; clear error if busy).
Python 3.8+ standard library only — no pip install needed. Dark liquid-glass UI over a dimmed nature photo backdrop (teal #4ECDC4 / blue #2196F3 / green #4CAF50 / orange #FF5722 accents), no build step, no CDN.

## Tabs

- **Overview** — two big clickable glass cards: **Relevant March offers** (opens a simplified offer list) and
  **People contacted** (opens contact bubbles; updates automatically as you mark Sent in Outreach).
  Below: a pipeline **funnel** (relevant → explicit March → packets ready → applied), canonical role-family bars
  (each role counted once in its primary family), and an inbox-style **Follow-ups & deadlines** list
  (application deadlines + people to follow up with, last-contacted dates).
- **Pipeline** — explicit-March roles + confirm-March leads in one table. Filters: search, **BBA-relevant only**
  (default on; hides tech/IT/cyber/security/engineering/quant roles), **Explicit March only**. Status dropdown per
  row (saved locally), portal links, notes/eligibility flags, CSV export (`/api/export.csv`).
- **Outreach** — one list of people: Name, Company, Position, Why connect, LinkedIn, Status (sent / not sent, editable).
- **About** — search criteria/method, blockers/tasks, run help.

## Files

- `app.py` — stdlib HTTP server (`/`, `/static/*`, `/api/data`, `/api/override`, `/api/export.csv`)
- `static/` — SPA (vanilla JS, inline SVG charts) + `logo.svg` (brand mark, also the favicon)
- `data/*.json` — exported 2026-11-23 from the Drive sheet; updated 2026-11-24 from the conversation log in INTERNSHIPSTER
  (added *SCAPE Programmes Intern + MAS Polytechnic Mar-2027 as explicit-March; SGC/AHK as confirm-March lead;
  people list curated to the French network: FCCS/FrenchTech SG tier-1 + French-speaking SG recruiters) `AI HQ → Projects → INTERNSHIPSTER → "March 2027 Internships - Singapore"`
  plus `Au MINE IN/SH - lenny` (contacts/outreach). Local edits persist in gitignored `data/overrides.json`.
- `src/` + `parse_sheets.py` — re-export pipeline to refresh `data/*.json` from the Drive sheet
