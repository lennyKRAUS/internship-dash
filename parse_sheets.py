import csv
import io
import json
import os

SRC = "/workspace/src"
OUT = "/workspace/internship-dashboard/data"
os.makedirs(OUT, exist_ok=True)


def read_sections(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    sections = {}
    current = None
    for line in text.splitlines():
        if line.startswith("Sheet: "):
            current = line[len("Sheet: "):].strip()
            sections[current] = []
        elif current is not None:
            sections[current].append(line)
    return sections


def parse_rows(lines):
    rows = list(csv.reader(io.StringIO("\n".join(lines))))
    cleaned = []
    for r in rows:
        r = [("" if c.strip().lower() == "nan" else c.strip()) for c in r]
        if any(c for c in r):
            cleaned.append(r)
    return cleaned


def pad(row, n):
    return (row + [""] * n)[:n]


def write_json(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print(name, "written")


main = read_sections(os.path.join(SRC, "main_sheet.txt"))

# --- Tab 1: Explicit March 2027 (contains outreach block at top) ---
rows = parse_rows(main["Explicit March 2027"])
header_idx = next(i for i, r in enumerate(rows) if r and r[0] == "Company")
pre = rows[:header_idx]
header = rows[header_idx]
data = [dict(zip(pad(header, len(header)), pad(r, len(header)))) for r in rows[header_idx + 1:]]

ph_idx = next((i for i, r in enumerate(pre) if r and r[0] == "PEOPLES"), 0)
outreach_header = pre[ph_idx] if pre else []
outreach_rows = []
holds = []
for r in pre[ph_idx + 1:]:
    r = pad(r, len(outreach_header))
    rec = dict(zip(pad(outreach_header, len(outreach_header)), r))
    if rec.get("PEOPLES"):
        outreach_rows.append(rec)
    elif any(v.startswith("HOLD") for v in rec.values()):
        holds.append(next(v for v in rec.values() if v.startswith("HOLD")))

write_json("pipeline_explicit.json", data)
write_json("outreach_sent.json", outreach_rows)
write_json("holds.json", holds)

# --- Tab 2: Leads ---
rows = parse_rows(main["Leads - confirm March"])
header = rows[0]
leads = [dict(zip(pad(header, len(header)), pad(r, len(header)))) for r in rows[1:]]
write_json("pipeline_leads.json", leads)

# --- Tab 3: Closed or rejected ---
rows = parse_rows(main["Closed or rejected"])
header = rows[0]
closed = [dict(zip(pad(header, len(header)), pad(r, len(header)))) for r in rows[1:]]
write_json("closed_rejected.json", closed)

# --- Tab 4: Read me ---
rows = parse_rows(main["Read me"])
readme = {}
for r in rows:
    key = r[0] if r else ""
    val = r[1] if len(r) > 1 else ""
    if key:
        readme[key] = val
write_json("readme.json", readme)

# --- People / contacts sheet ---
people = read_sections(os.path.join(SRC, "people_sheet.txt"))
rows = parse_rows(people["Sheet1"])
contacts_header_idx = next(i for i, r in enumerate(rows) if r and r[0] == "Name")
log_header = rows[0]
log_rows = [dict(zip(pad(log_header, len(log_header)), pad(r, len(log_header)))) for r in rows[1:contacts_header_idx]]
log_rows = [r for r in log_rows if r.get("PEOPLES")]
contacts_header = rows[contacts_header_idx]
contacts = [dict(zip(pad(contacts_header, len(contacts_header)), pad(r, len(contacts_header)))) for r in rows[contacts_header_idx + 1:]]
write_json("outreach_log.json", log_rows)
write_json("contacts.json", contacts)

tasks_rows = parse_rows(people["Hermes Tasks"])
th = tasks_rows[0]
tasks = [dict(zip(pad(th, len(th)), pad(r, len(th)))) for r in tasks_rows[1:]]
write_json("tasks.json", tasks)

print("explicit:", len(data), "leads:", len(leads), "closed:", len(closed), "contacts:", len(contacts), "log:", len(log_rows), "tasks:", len(tasks))
