let DATA = null;
const STATUS_OPTIONS = ["Not started", "Packet ready", "Applied", "Hold", "Skip"];
const BUCKET_COLORS = {
  Applied: "#3fb27f", "Packet ready": "#5b8cff", Hold: "#e0a83c",
  Skip: "#8b96a5", "Not started": "#5a6675",
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function bucket(status) {
  const s = String(status || "").toLowerCase();
  if (/done|applied/.test(s)) return "Applied";
  if (/packet/.test(s)) return "Packet ready";
  if (/hold/.test(s)) return "Hold";
  if (/skip/.test(s)) return "Skip";
  return "Not started";
}

function effBucket(row) {
  return row["Dashboard status"] ? bucket(row["Dashboard status"]) : bucket(row["Application status"]);
}

function pillClass(b) {
  return { "Applied": "applied", "Packet ready": "packet", "Hold": "hold", "Skip": "skip" }[b] || "todo";
}

function parseDeadline(s) {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function daysLeft(d) {
  return Math.round((d - Date.now()) / 86400000);
}

function deadlinePill(s) {
  const d = parseDeadline(s);
  if (!d) return '<span class="deadline"><span class="d">' + esc(s) + "</span></span>";
  const left = daysLeft(d);
  const cls = left < 0 ? "urgent" : left <= 7 ? "urgent" : left <= 14 ? "due" : "ok";
  const label = left < 0 ? "OVERDUE " + (-left) + "d" : left + "d left";
  return '<span class="deadline"><span class="pill ' + cls + '">' + label + "</span> <span class='d'>" +
    d.toISOString().slice(0, 10) + "</span></span>";
}

function donut(counts) {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0, arcs = "";
  for (const [k, v] of entries) {
    const frac = v / total;
    arcs += '<circle r="' + R + '" cx="70" cy="70" fill="transparent" stroke="' + BUCKET_COLORS[k] +
      '" stroke-width="22" stroke-dasharray="' + (frac * C - 2) + " " + (C - frac * C + 2) +
      '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 70 70)"></circle>';
    offset += frac * C;
  }
  let legend = entries.map(([k, v]) =>
    '<span style="color:' + BUCKET_COLORS[k] + '">■</span> ' + esc(k) + " (" + v + ")").join(" &nbsp; ");
  return '<svg width="140" height="140">' + arcs +
    '<text x="70" y="66" text-anchor="middle" fill="#e6ebf2" font-size="22" font-weight="700">' + total + "</text>" +
    '<text x="70" y="84" text-anchor="middle" fill="#8b96a5" font-size="11">explicit roles</text></svg>' +
    '<div class="legend" style="margin-top:10px">' + legend + "</div>";
}

function bars(counts, color) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return entries.map(([k, v]) =>
    '<div class="bar-row"><span class="name" title="' + esc(k) + '">' + esc(k) + '</span>' +
    '<span class="bar" style="width:' + Math.round(220 * v / max) + 'px;background:' + color + '"></span>' +
    '<span class="val">' + v + "</span></div>").join("") || '<span class="muted">no data</span>';
}

function countBy(rows, key) {
  const out = {};
  for (const r of rows) {
    const k = (r[key] || "Other").trim() || "Other";
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function statusSelect(kind, index, current) {
  const opts = STATUS_OPTIONS.map(o =>
    '<option value="' + o + '"' + (bucket(current) === o ? " selected" : "") + ">" + o + "</option>").join("");
  return '<select class="status" data-kind="' + kind + '" data-index="' + index + '">' + opts + "</select>";
}

function rowMatches(row, q) {
  if (!q) return true;
  return Object.values(row).some(v => String(v || "").toLowerCase().includes(q));
}

function renderOverview() {
  const ex = DATA.explicit, leads = DATA.leads;
  const buckets = {};
  for (const r of ex) { const b = effBucket(r); buckets[b] = (buckets[b] || 0) + 1; }
  const applied = (buckets["Applied"] || 0);
  const packets = (buckets["Packet ready"] || 0);
  const holds = ex.filter(r => effBucket(r) === "Hold").length + (DATA.holds || []).length;
  const urgent = ex.filter(r => { const d = parseDeadline(r["Application deadline"]); return d && daysLeft(d) <= 7 && daysLeft(d) >= 0; });
  const overdue = ex.filter(r => { const d = parseDeadline(r["Application deadline"]); return d && daysLeft(d) < 0; });
  const sent = (DATA.outreach || []).filter(o => o.status === "SENT").length;

  const kpis = [
    { num: ex.length, lbl: "Explicit March 2027 matches", cls: "" },
    { num: leads.length, lbl: "Leads to confirm", cls: "" },
    { num: applied, lbl: "Applied", cls: "good" },
    { num: packets, lbl: "Packets ready", cls: "" },
    { num: holds, lbl: "Holds / blockers", cls: "amber" },
    { num: urgent.length + overdue.length, lbl: "Deadlines ≤ 7 days", cls: (urgent.length + overdue.length) ? "warn" : "good" },
    { num: sent, lbl: "Outreach sent", cls: "" },
    { num: (DATA.contacts || []).length, lbl: "Contacts (SG 50)", cls: "" },
  ];
  let html = '<div class="kpis">' + kpis.map(k =>
    '<div class="kpi ' + k.cls + '"><div class="num">' + k.num + '</div><div class="lbl">' + k.lbl + "</div></div>").join("") + "</div>";

  html += '<div class="charts">' +
    '<div class="chart"><h3>Pipeline status</h3>' + donut(buckets) + "</div>" +
    '<div class="chart"><h3>Role families (explicit + leads)</h3>' + bars(countBy(ex.concat(leads), "Family"), "#5b8cff") + "</div>" +
    '<div class="chart"><h3>Contacts by category</h3>' + bars(countBy(DATA.contacts || [], "Category"), "#a07ee8") + "</div>" +
    "</div>";

  const due = ex.filter(r => parseDeadline(r["Application deadline"]))
    .sort((a, b) => parseDeadline(a["Application deadline"]) - parseDeadline(b["Application deadline"]));
  html += '<div class="panel"><h2>Deadlines</h2><table><thead><tr><th>Company</th><th>Role</th><th>Deadline</th><th>Status</th></tr></thead><tbody>' +
    due.map(r => "<tr><td>" + esc(r.Company) + "</td><td>" + esc(r.Role) + "</td><td>" + deadlinePill(r["Application deadline"]) +
      '</td><td><span class="pill ' + pillClass(effBucket(r)) + '">' + esc(effBucket(r)) + "</span></td></tr>").join("") +
    "</tbody></table></div>";

  if (DATA.holds && DATA.holds.length) {
    html += '<div class="panel"><h2>Blockers</h2><ul class="tight">' +
      DATA.holds.map(h => "<li>" + esc(h) + "</li>").join("") + "</ul></div>";
  }
  document.getElementById("tab-overview").innerHTML = html;
}

function pipelineTable(rows, kind) {
  const q = (document.getElementById("q-" + kind).value || "").toLowerCase();
  const fam = document.getElementById("fam-" + kind).value;
  const st = document.getElementById("st-" + kind).value;
  let html = '<div class="controls">' +
    '<input type="search" id="q-' + kind + '" placeholder="Search company, role, notes…" value="' + esc(q) + '">' +
    '<select id="fam-' + kind + '"><option value="">All families</option>' +
    Object.keys(countBy(rows, "Family")).sort().map(f => '<option' + (f === fam ? " selected" : "") + ">" + esc(f) + "</option>").join("") +
    '</select><select id="st-' + kind + '"><option value="">All statuses</option>' +
    STATUS_OPTIONS.map(s => '<option' + (s === st ? " selected" : "") + ">" + s + "</option>").join("") +
    "</select>" +
    (kind === "explicit" ? '<a class="btn" href="/api/export.csv" download>Export CSV</a>' : "") +
    "</div>";
  html += '<div class="panel"><table><thead><tr><th>Company</th><th>Role</th><th>Family</th><th>Start</th><th>Duration</th><th>Pay</th><th>Deadline</th><th>Status</th><th>Portal</th><th>Notes</th></tr></thead><tbody>';
  rows.forEach((r, i) => {
    const b = effBucket(r);
    if (!rowMatches(r, q)) return;
    if (fam && (r.Family || "") !== fam) return;
    if (st && b !== st) return;
    const dl = r["Application deadline"] !== undefined ? deadlinePill(r["Application deadline"]) : '<span class="muted">—</span>';
    html += "<tr><td><strong>" + esc(r.Company) + "</strong></td><td>" + esc(r.Role) + "</td><td>" + esc(r.Family) +
      "</td><td>" + esc(r["Start (March 2027)"] || r["Start stated"] || "") + "</td><td>" + esc(r.Duration) + "</td><td>" + esc(r["Pay (SGD/month)"] || "") +
      "</td><td>" + dl + '</td><td>' + statusSelect(kind, i, r["Dashboard status"] || r["Application status"]) +
      '<div class="small muted" style="margin-top:4px">' + esc(r["Application status"] || "") + "</div></td><td>" +
      (r["Portal link"] && r["Portal link"] !== "UNRDD" ? '<a href="' + esc(r["Portal link"]) + '" target="_blank" rel="noopener">open ↗</a>' : '<span class="muted">UNRDD</span>') +
      '</td><td class="small">' + esc(r["Notes / eligibility flags"] || r.Note || "") + "</td></tr>";
  });
  html += "</tbody></table></div>";
  return html;
}

function renderPipeline() {
  document.getElementById("tab-pipeline").innerHTML = pipelineTable(DATA.explicit, "explicit");
  bindPipelineControls("explicit");
}

function renderLeads() {
  document.getElementById("tab-leads").innerHTML = pipelineTable(DATA.leads, "leads");
  bindPipelineControls("leads");
}

function bindPipelineControls(kind) {
  for (const id of ["q-" + kind, "fam-" + kind, "st-" + kind]) {
    document.getElementById(id).addEventListener("input", () => {
      if (kind === "explicit") renderPipeline(); else renderLeads();
    });
  }
}

function renderOutreach() {
  const sent = DATA.outreach || [];
  const contacts = DATA.contacts || [];
  let html = '<div class="panel"><h2>Sent outreach (' + sent.length + ")</h2>";
  if (sent.length) {
    html += "<table><thead><tr><th>Name</th><th>Company</th><th>Role / interest</th><th>Status</th><th>LinkedIn</th></tr></thead><tbody>" +
      sent.map(o => "<tr><td>" + esc(o.name) + "</td><td>" + esc(o.company) + "</td><td>" + esc(o.role) +
        '</td><td><span class="pill ' + (o.status === "SENT" ? "sent" : "todo") + '">' + esc(o.status || "—") + "</span></td><td>" +
        (o.linkedin ? '<a href="' + esc(o.linkedin) + '" target="_blank" rel="noopener">open ↗</a>' : "") + "</td></tr>").join("") +
      "</tbody></table>";
  } else html += '<p class="muted">No outreach logged yet.</p>';
  html += "</div>";

  html += '<div class="panel"><h2>Contact list (' + contacts.length + ')</h2><div class="controls">' +
    '<input type="search" id="cq" placeholder="Search name, title, company…">' +
    '<select id="ccat"><option value="">All categories</option>' +
    Object.keys(countBy(contacts, "Category")).sort().map(c => "<option>" + esc(c) + "</option>").join("") +
    "</select></div>" +
    '<table><thead><tr><th>Name</th><th>Title</th><th>Company</th><th>Category</th><th>LinkedIn</th></tr></thead><tbody id="ctbody"></tbody></table></div>';
  document.getElementById("tab-outreach").innerHTML = html;

  const renderContacts = () => {
    const q = (document.getElementById("cq").value || "").toLowerCase();
    const cat = document.getElementById("ccat").value;
    const body = contacts.filter(c => (!cat || c.Category === cat) && rowMatches(c, q)).map(c =>
      "<tr><td>" + esc(c.Name) + "</td><td>" + esc(c["Job Title"]) + "</td><td>" + esc(c.Company) + "</td><td>" + esc(c.Category) +
      '</td><td>' + (c.LinkedIn ? '<a href="' + esc(c.LinkedIn) + '" target="_blank" rel="noopener">open ↗</a>' : '<span class="muted">—</span>') + "</td></tr>").join("");
    document.getElementById("ctbody").innerHTML = body || '<tr><td colspan="5" class="muted">no matches</td></tr>';
  };
  document.getElementById("cq").addEventListener("input", renderContacts);
  document.getElementById("ccat").addEventListener("input", renderContacts);
  renderContacts();
}

function renderArchive() {
  const closed = DATA.closed || [];
  let html = '<div class="controls">' +
    '<input type="search" id="aq" placeholder="Search company, role, reason…">' +
    '<select id="astatus"><option value="">All</option>' +
    ["open", "closed", "rejected", "unclear"].map(s => "<option>" + s + "</option>").join("") +
    '</select><span class="muted small">' + closed.length + ' records</span></div>';
  html += '<div class="panel"><table><thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Reason</th><th>Link</th></tr></thead><tbody id="abody"></tbody></table></div>';
  document.getElementById("tab-archive").innerHTML = html;
  const render = () => {
    const q = (document.getElementById("aq").value || "").toLowerCase();
    const st = document.getElementById("astatus").value;
    const rows = closed.filter(r => (!st || r.Status === st) && rowMatches(r, q)).slice(0, 300);
    document.getElementById("abody").innerHTML = rows.map(r =>
      "<tr><td>" + esc(r.Company) + "</td><td>" + esc(r.Role) + '</td><td><span class="pill ok">' + esc(r.Status) + "</span></td><td class='small'>" +
      esc(r.Reason) + '</td><td>' + (r.Link && r.Link !== "nan" ? '<a href="' + esc(r.Link) + '" target="_blank" rel="noopener">open ↗</a>' : "") + "</td></tr>").join("") ||
      '<tr><td colspan="5" class="muted">no matches</td></tr>';
  };
  document.getElementById("aq").addEventListener("input", render);
  document.getElementById("astatus").addEventListener("input", render);
  render();
}

function renderAbout() {
  const rm = DATA.readme || {};
  let html = '<div class="panel"><h2>Search criteria & method</h2><dl class="kv">' +
    Object.entries(rm).map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl></div>";
  html += '<div class="panel"><h2>Tasks</h2><ul class="tight">' +
    (DATA.tasks || []).map(t => "<li><strong>" + esc(t.Status) + "</strong> — " + esc(t.Task) + (t.Details ? ' <span class="muted">(' + esc(t.Details) + ")</span>" : "")).join("") + "</ul></div>";
  html += '<div class="panel"><h2>Run it yourself</h2><ul class="tight">' +
    "<li><code>python3 app.py</code> → open <strong>http://localhost:" + location.port + "</strong> (binds to 127.0.0.1 only; default port 8787 — set <code>PORT</code>/<code>HOST</code> env vars to change; if the port is taken you'll get a clear error, pick another).</li>" +
    "<li>Data lives in <code>data/*.json</code> (exported from your Drive sheet). Edits you make (status dropdowns) are saved to <code>data/overrides.json</code> on this machine.</li>" +
    "<li>Ask your Vibe session to re-export from Drive to refresh the JSON — the sheet stays the source of truth.</li>" +
    "</ul></div>";
  document.getElementById("tab-about").innerHTML = html;
}

function updateBadges() {
  const actionable = DATA.explicit.filter(r => !["Applied", "Skip"].includes(effBucket(r))).length;
  document.getElementById("badge-pipeline").textContent = actionable;
  document.getElementById("badge-leads").textContent = DATA.leads.length;
  document.getElementById("badge-outreach").textContent = (DATA.outreach || []).length;
}

function renderAll() {
  renderOverview(); renderPipeline(); renderLeads(); renderOutreach(); renderArchive(); renderAbout();
  updateBadges();
}

document.getElementById("tabs").addEventListener("click", e => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
});

document.addEventListener("change", e => {
  const sel = e.target.closest("select.status");
  if (!sel) return;
  fetch("/api/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: sel.dataset.kind, index: +sel.dataset.index, field: "Dashboard status", value: sel.value }),
  }).then(r => r.json()).then(d => {
    DATA = d;
    renderOverview(); renderPipeline(); renderLeads(); updateBadges();
    const f = document.createElement("div");
    f.className = "flash"; f.textContent = "Saved ✓";
    document.body.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = "1"; });
    setTimeout(() => { f.style.opacity = "0"; setTimeout(() => f.remove(), 400); }, 1200);
  });
});

fetch("/api/data").then(r => r.json()).then(d => { DATA = d; renderAll(); });
