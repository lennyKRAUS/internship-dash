let DATA = null;
const STATUS_OPTIONS = ["Not started", "Packet ready", "Applied", "Hold", "Skip"];
const OUTREACH_STATUS = ["Not sent", "Sent"];
const BUCKET_COLORS = {
  Applied: "#7bd88f", "Packet ready": "#8ab4ff", Hold: "#ffd479",
  Skip: "#c3c3d2", "Not started": "#b9b9ca",
};
const EXCLUDE_RE = /\btech\b|\bit\b|cyber|security|engineer|quant|software|developer|\bsre\b|backend/i;
const FILTERS = { pipeline: { q: "", bba: true, march: false } };

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bucket = s => {
  const x = String(s || "").toLowerCase();
  if (/done|applied/.test(x)) return "Applied";
  if (/packet/.test(x)) return "Packet ready";
  if (/hold/.test(x)) return "Hold";
  if (/skip/.test(x)) return "Skip";
  return "Not started";
};
const effBucket = r => (r["Dashboard status"] ? bucket(r["Dashboard status"]) : bucket(r["Application status"] || ""));
const pillClass = b => ({ Applied: "applied", "Packet ready": "packet", Hold: "hold", Skip: "skip" }[b] || "todo");
const parseDeadline = s => {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};
const daysLeft = d => Math.round((d - Date.now()) / 86400000);
function deadlinePill(s) {
  const d = parseDeadline(s);
  if (!d) return `<span class="deadline"><span class="d">${esc(s || "—")}</span></span>`;
  const left = daysLeft(d);
  const cls = left < 0 || left <= 7 ? "urgent" : left <= 14 ? "due" : "ok";
  const label = left < 0 ? `OVERDUE ${-left}d` : `${left}d left`;
  return `<span class="deadline"><span class="pill ${cls}">${label}</span> <span class="d">${d.toISOString().slice(0, 10)}</span></span>`;
}
const rowMatches = (row, q) => !q || Object.values(row).some(v => String(v || "").toLowerCase().includes(q));
const countBy = (rows, key) => {
  const o = {};
  for (const r of rows) { const k = (r[key] || "Other").trim() || "Other"; o[k] = (o[k] || 0) + 1; }
  return o;
};
const relevant = r => {
  if (!FILTERS.pipeline.bba) return true;
  const hay = ((r.Family || "") + " " + (r.Role || "")).replace(/non-?\s*tech/gi, " ");
  return !EXCLUDE_RE.test(hay);
};
const expiredLead = r => r.List === "Confirm March" && /closed|expired/i.test((r.Note || "") + " " + (r["Start stated"] || ""));
const visible = r => {
  const f = FILTERS.pipeline;
  return relevant(r) && !expiredLead(r) && (!f.march || r.List === "Explicit March") && rowMatches(r, f.q.toLowerCase());
};
const visibleRows = () => (DATA.pipeline || []).filter(visible);

function donut(counts) {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0, arcs = "";
  for (const [k, v] of entries) {
    const frac = v / total;
    arcs += `<circle r="${R}" cx="70" cy="70" fill="transparent" stroke="${BUCKET_COLORS[k]}" stroke-width="22" stroke-dasharray="${frac * C - 2} ${C - frac * C + 2}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"></circle>`;
    offset += frac * C;
  }
  const legend = entries.map(([k, v]) => `<span style="color:${BUCKET_COLORS[k]}">■</span> ${esc(k)} (${v})`).join(" &nbsp; ");
  return `<svg width="140" height="140">${arcs}<text x="70" y="66" text-anchor="middle" fill="#e6ebf2" font-size="22" font-weight="800">${total}</text><text x="70" y="84" text-anchor="middle" fill="#9aa5b5" font-size="11">roles</text></svg>
    <div class="legend">${legend}</div>`;
}
function bars(counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return entries.map(([k, v]) =>
    `<div class="bar-row"><span class="name" title="${esc(k)}">${esc(k)}</span><span class="bar" style="width:${Math.round(220 * v / max)}px"></span><span class="val">${v}</span></div>`
  ).join("") || '<span class="muted">no data</span>';
}

function statusSelect(kind, key, current, options) {
  const cur = kind === "pipeline" ? bucket(current) : (current === "Sent" ? "Sent" : "Not sent");
  const opts = options.map(o => `<option value="${o}"${cur === o ? " selected" : ""}>${o}</option>`).join("");
  return `<select class="${kind === "pipeline" ? "status" : "ostatus"}" data-kind="${kind}" data-key="${esc(key)}">${opts}</select>`;
}

function canonFamily(r) {
  const f = (r.Family || "") + " " + (r.Role || "");
  if (/consulting/i.test(f)) return "Consulting";
  if (/finance|accounting|tax|banking/i.test(f)) return "Finance";
  if (/data|analytics/i.test(f)) return "Data";
  if (/business|\bops\b|\bbd\b|communications|marketing/i.test(f)) return "Business / Ops / BD";
  if (/machine learning|\bml\b|\bai\b/i.test(f)) return "AI / ML";
  if (/tech|\bit\b|cyber|security/i.test(f)) return "Tech";
  return "Other";
}

function funnelHtml(stages) {
  const max = Math.max(1, stages[0].value);
  return stages.map((s, i) => {
    const w = Math.max(7, Math.round(100 * s.value / max));
    const pct = i === 0 || !stages[i - 1].value ? "" : ` · ${Math.round(100 * s.value / stages[i - 1].value)}%`;
    return `<div class="funnel-row"><span class="f-label">${esc(s.label)}</span><span class="f-track"><span class="f-bar" style="width:${w}%"></span></span><span class="f-val">${s.value}${pct}</span></div>`;
  }).join("");
}

function openModal(title, bodyHtml) {
  closeModal();
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.id = "modal";
  ov.innerHTML = `<div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" id="modal-x">✕</button></div><div class="modal-body">${bodyHtml}</div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov || (e.target && e.target.id === "modal-x")) closeModal(); });
}
function closeModal() {
  const m = document.getElementById("modal");
  if (m) m.remove();
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function initials(name) {
  return String(name || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function offersModalHtml() {
  const rows = visibleRows().filter(r => r.List === "Explicit March");
  if (!rows.length) return '<p class="muted">No relevant explicit-March offers right now.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Company</th><th>Role</th><th>Family</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>` +
    rows.map(r => `<tr><td><strong>${esc(r.Company)}</strong></td><td>${esc(r.Role)}</td><td>${esc(canonFamily(r))}</td><td>${deadlinePill(r["Application deadline"])}</td><td><span class="pill ${pillClass(effBucket(r))}">${esc(effBucket(r))}</span></td><td>${r["Portal link"] && r["Portal link"] !== "UNRDD" ? `<a href="${esc(r["Portal link"])}" target="_blank" rel="noopener">apply ↗</a>` : ""}</td></tr>`).join("") +
    `</tbody></table></div>`;
}

function peopleModalHtml() {
  const sent = (DATA.people || []).filter(p => p.Status === "Sent");
  if (!sent.length) return '<p class="muted">No one contacted yet — mark people as Sent in the Outreach tab.</p>';
  return `<div class="bubbles">` + sent.map(p =>
    `<div class="bubble"><span class="avatar">${esc(initials(p.Name))}</span><div class="bubble-main"><strong>${esc(p.Name)}</strong><span class="bubble-sub">${esc(p.Company)} — ${esc(p.Position)}</span><span class="bubble-why">${esc(p.Relevance)}</span>${p.LinkedIn ? `<a class="bubble-link" href="${esc(p.LinkedIn)}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}</div><span class="pill sent">sent</span></div>`
  ).join("") + `</div>`;
}

function inboxHtml() {
  const items = [];
  for (const r of visibleRows()) {
    if (r.List !== "Explicit March") continue;
    const d = parseDeadline(r["Application deadline"]);
    if (!d) continue;
    items.push({ type: "app", date: d, title: r.Company, sub: r.Role, note: r["Notes / eligibility flags"] || "", right: deadlinePill(r["Application deadline"]), href: r["Portal link"] });
  }
  const sentDate = parseDeadline("2026-11-16");
  for (const p of (DATA.people || []).filter(p => p.Status === "Sent")) {
    items.push({ type: "person", date: sentDate, title: p.Name, sub: `${p.Company} — ${p.Position}`, note: p.Relevance || "", right: `<span class="pill ok">contacted 16/11</span>`, href: p.LinkedIn });
  }
  items.sort((a, b) => a.date - b.date);
  if (!items.length) return '<p class="muted">Nothing time-sensitive right now.</p>';
  return items.map(it => `<div class="inbox-row">
    <span class="avatar ${it.type === "person" ? "avatar-person" : ""}">${it.type === "person" ? esc(initials(it.title)) : "✉"}</span>
    <div class="inbox-main"><div class="inbox-top"><strong>${esc(it.title)}</strong><span class="inbox-sub">${esc(it.sub)}</span></div>
    <div class="inbox-snippet">${esc(it.note)}</div></div>
    <div class="inbox-right">${it.right}${it.href && it.href !== "UNRDD" ? ` <a href="${esc(it.href)}" target="_blank" rel="noopener">↗</a>` : ""}</div>
  </div>`).join("");
}

function renderOverview() {
  const rows = visibleRows();
  const explicit = rows.filter(r => r.List === "Explicit March");
  const sent = (DATA.people || []).filter(p => p.Status === "Sent");
  const buckets = {};
  for (const r of rows) { const b = effBucket(r); buckets[b] = (buckets[b] || 0) + 1; }
  const big = [
    { id: "offers", num: explicit.length, lbl: "Relevant March offers", hint: "March 2027 start · BBA-fit · listing open — click to browse" },
    { id: "people", num: sent.length, lbl: "People contacted", hint: "LinkedIn connect notes sent so far — click to see who" },
  ];
  let html = `<div class="kpis-big">` + big.map(b =>
    `<button class="kpi-big" data-modal="${b.id}"><span class="num">${b.num}</span><span class="lbl">${b.lbl}</span><span class="hint">${b.hint}</span></button>`
  ).join("") + `</div>`;
  const stages = [
    { label: "Relevant offers", value: rows.length },
    { label: "Explicit March", value: explicit.length },
    { label: "Packets ready", value: buckets["Packet ready"] || 0 },
    { label: "Applied", value: buckets["Applied"] || 0 },
  ];
  html += `<div class="charts">
    <div class="chart"><h3>Funnel</h3>${funnelHtml(stages)}</div>
    <div class="chart"><h3>Role families (primary bucket, counted once)</h3>${bars(countBy(rows.map(r => ({ Family: canonFamily(r) })), "Family"))}</div>
  </div>`;
  html += `<div class="panel"><h2>Follow-ups &amp; deadlines</h2>${inboxHtml()}</div>`;
  document.getElementById("tab-overview").innerHTML = html;
  document.querySelectorAll(".kpi-big").forEach(btn => btn.addEventListener("click", () => {
    if (btn.dataset.modal === "offers") openModal("Relevant March offers", offersModalHtml());
    else openModal("People contacted", peopleModalHtml());
  }));
}

function renderPipeline() {
  const f = FILTERS.pipeline;
  let html = `<div class="controls">
    <input type="search" id="q-pipeline" placeholder="Search company, role, notes…" value="${esc(f.q)}">
    <label class="toggle"><input type="checkbox" id="bba-pipeline"${f.bba ? " checked" : ""}> BBA-relevant only</label>
    <label class="toggle"><input type="checkbox" id="march-pipeline"${f.march ? " checked" : ""}> Explicit March only</label>
    <a class="btn" href="/api/export.csv" download>Export CSV</a>
  </div><div class="panel"><div class="table-wrap"><table>
  <thead><tr><th>Company</th><th>Role</th><th>Family</th><th>Intake</th><th>Start</th><th>Duration</th><th>Pay</th><th>Deadline</th><th>Status</th><th>Portal</th><th>Notes</th></tr></thead><tbody>`;
  (DATA.pipeline || []).forEach((r, i) => {
    if (!visible(r)) return;
    const dl = r["Application deadline"] !== undefined && r.List === "Explicit March"
      ? deadlinePill(r["Application deadline"]) : '<span class="muted">—</span>';
    const intake = r.List === "Explicit March" ? '<span class="pill march">explicit March</span>' : '<span class="pill confirm">confirm March</span>';
    html += `<tr><td><strong>${esc(r.Company)}</strong></td><td>${esc(r.Role)}</td><td>${esc(r.Family)}</td><td>${intake}</td>
      <td>${esc(r["Start (March 2027)"] || r["Start stated"] || "")}</td><td>${esc(r.Duration || "")}</td><td>${esc(r["Pay (SGD/month)"] || "")}</td>
      <td>${dl}</td>
      <td>${statusSelect("pipeline", (r.Company || "") + "|" + (r.Role || ""), r["Dashboard status"] || r["Application status"] || "", STATUS_OPTIONS)}
      <div class="small muted" style="margin-top:4px">${esc(r["Application status"] || "")}</div></td>
      <td>${r["Portal link"] && r["Portal link"] !== "UNRDD" ? `<a href="${esc(r["Portal link"])}" target="_blank" rel="noopener">open ↗</a>` : '<span class="muted">UNRDD</span>'}</td>
      <td class="small">${esc(r["Notes / eligibility flags"] || r.Note || "")}</td></tr>`;
  });
  html += `</tbody></table></div></div>`;
  document.getElementById("tab-pipeline").innerHTML = html;
  const q = document.getElementById("q-pipeline");
  q.addEventListener("input", e => { FILTERS.pipeline.q = e.target.value; renderPipeline(); renderOverview(); updateBadges(); });
  const bba = document.getElementById("bba-pipeline");
  bba.addEventListener("change", e => { FILTERS.pipeline.bba = e.target.checked; renderPipeline(); renderOverview(); updateBadges(); });
  const march = document.getElementById("march-pipeline");
  march.addEventListener("change", e => { FILTERS.pipeline.march = e.target.checked; renderPipeline(); renderOverview(); updateBadges(); });
}

function renderOutreach() {
  const people = DATA.people || [];
  let html = `<div class="panel"><div class="controls">
    <input type="search" id="oq" placeholder="Search name, company, position, relevance…">
    <span class="muted small">${people.length} people</span>
  </div><div class="table-wrap"><table>
  <thead><tr><th>Name</th><th>Company</th><th>Position</th><th>Why connect</th><th>LinkedIn</th><th>Status</th></tr></thead><tbody id="obody"></tbody></table></div></div>`;
  document.getElementById("tab-outreach").innerHTML = html;
  const renderRows = () => {
    const q = (document.getElementById("oq").value || "").toLowerCase();
    const rows = people.map((p, i) => ({ p, i })).filter(({ p }) => rowMatches(p, q));
    document.getElementById("obody").innerHTML = rows.map(({ p, i }) =>
      `<tr><td><strong>${esc(p.Name)}</strong></td><td>${esc(p.Company)}</td><td>${esc(p.Position)}</td><td class="small">${esc(p.Relevance)}</td>
      <td>${p.LinkedIn ? `<a href="${esc(p.LinkedIn)}" target="_blank" rel="noopener">open ↗</a>` : '<span class="muted">—</span>'}</td>
      <td>${statusSelect("people", p.LinkedIn || p.Name || "", p.Status || "", OUTREACH_STATUS)} <span class="pill ${p.Status === "Sent" ? "sent" : "todo"}">${p.Status === "Sent" ? "sent" : "not sent"}</span></td></tr>`
    ).join("") || '<tr><td colspan="6" class="muted">no matches</td></tr>';
  };
  document.getElementById("oq").addEventListener("input", renderRows);
  renderRows();
}

function renderAbout() {
  const rm = DATA.readme || {};
  let html = `<div class="panel"><h2>Search criteria & method</h2><dl class="kv">` +
    Object.entries(rm).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") + `</dl></div>`;
  html += `<div class="panel"><h2>Blockers / tasks</h2><ul class="tight">` +
    (DATA.holds || []).map(h => `<li>🚧 ${esc(h)}</li>`).join("") +
    (DATA.tasks || []).map(t => `<li><strong>${esc(t.Status)}</strong> — ${esc(t.Task)}</li>`).join("") + `</ul></div>`;
  html += `<div class="panel"><h2>Run it</h2><ul class="tight">
    <li><code>python3 app.py</code> → open <strong>http://localhost:${location.port}</strong> (default port 8787; <code>PORT</code>/<code>HOST</code> env vars override; binds 127.0.0.1 only).</li>
    <li>Data: <code>data/*.json</code> exported from the Drive sheet; your status edits save to gitignored <code>data/overrides.json</code>.</li>
    <li>Refresh: re-read the sheet in Drive and re-run <code>parse_sheets.py</code>.</li>
  </ul></div>`;
  document.getElementById("tab-about").innerHTML = html;
}

function updateBadges() {
  document.getElementById("badge-pipeline").textContent = visibleRows().length;
  document.getElementById("badge-outreach").textContent = (DATA.people || []).filter(p => p.Status === "Sent").length;
}

function renderAll() {
  renderOverview(); renderPipeline(); renderOutreach(); renderAbout(); updateBadges();
}
function renderAllSafe() {
  try { renderAll(); }
  catch (err) {
    console.error(err);
    const b = document.createElement("div");
    b.className = "flash";
    b.style.color = "#b03030";
    b.textContent = "Render error: " + err.message;
    document.body.appendChild(b);
  }
}

document.getElementById("tabs").addEventListener("click", e => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
});

document.addEventListener("change", e => {
  const sel = e.target.closest("select.status, select.ostatus");
  if (!sel) return;
  const field = sel.dataset.kind === "people" ? "Status" : "Dashboard status";
  fetch("/api/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: sel.dataset.kind, key: sel.dataset.key, field, value: sel.value }),
  }).then(r => r.json()).then(d => {
    DATA = d;
    renderAllSafe();
    const f = document.createElement("div");
    f.className = "flash"; f.textContent = "Saved ✓";
    document.body.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = "1"; });
    setTimeout(() => { f.style.opacity = "0"; setTimeout(() => f.remove(), 400); }, 1200);
  });
});

// backdrop: server picks one randomly at each boot
fetch("/api/backdrop").then(r => r.json()).then(b => {
  if (b && b.url) document.body.style.backgroundImage = `url('${b.url}')`;
}).catch(() => {});

// initial load + live sync: re-fetch every 30s, re-render only if data changed
let LAST = null;
fetch("/api/data").then(r => r.json()).then(d => { DATA = d; LAST = JSON.stringify(d); renderAllSafe(); });
setInterval(() => {
  fetch("/api/data").then(r => r.json()).then(d => {
    const s = JSON.stringify(d);
    if (s !== LAST) { LAST = s; DATA = d; renderAllSafe(); }
    const ind = document.getElementById("sync-ind");
    if (ind) {
      ind.textContent = d.live ? "● live · synced " + (d.syncedAt || "") : "○ cached (sheet unreachable)";
      ind.className = "sub " + (d.live ? "live" : "off");
    }
  }).catch(() => {});
}, 30000);
