let currentFilter = "all";
let currentTab = "actual";
let searchTerm = "";
let rows = [];
let season = null;

const boardBody = document.getElementById("board-body");
const paceBody = document.getElementById("board-pace-body");
const boardActualTable = document.getElementById("board-actual");
const boardPaceTable = document.getElementById("board-pace");
const updatedAt = document.getElementById("updated-at");
const ticker = document.getElementById("ticker");
const paceBanner = document.getElementById("pace-banner");

function fmtTime(d) {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function tick() {
  ticker.textContent = fmtTime(new Date());
}
setInterval(tick, 1000);
tick();

function statusFor(row) {
  if (row.leading) return { key: "leading", label: "LEADING" };
  if (row.bust) return { key: "bust", label: "BUST" };
  if (row.allFourScored) return { key: "in", label: "STILL IN" };
  return { key: "needs", label: "NEEDS SCORERS" };
}

function flagFor(pick) {
  if (!pick.found) return `<span class="flag out">×</span>`;
  if (pick.reason) {
    const lower = pick.reason.toLowerCase();
    if (lower.includes("injur") || lower.includes("suspend") || lower.includes("out")) {
      return `<span class="flag out">×</span>`;
    }
    return `<span class="flag doubtful">!</span>`;
  }
  return "";
}

function matchesSearch(row) {
  if (!searchTerm) return true;
  const t = searchTerm.toLowerCase();
  if (row.manager.toLowerCase().includes(t)) return true;
  return row.picks.some((p) => p.name.toLowerCase().includes(t));
}

// ---------- ACTUAL table ----------

function renderRow(row, i) {
  const st = statusFor(row);
  const picksHtml = row.picks
    .map((p) => {
      const zeroClass = p.goals === 0 ? "zero" : "";
      const nf = !p.found ? "notfound" : "";
      const hit = searchTerm && p.name.toLowerCase().includes(searchTerm.toLowerCase()) ? "hit" : "";
      const label = p.found ? p.name : `${p.name}?`;
      return `<span class="pick-chip ${zeroClass} ${nf} ${hit}" title="${p.reason || ""}">${label} <span class="g">${p.found ? p.goals : "—"}</span> ${flagFor(p)}</span>`;
    })
    .join("");

  const toTxt = row.bust ? "—" : row.toTarget;
  const toClass = row.bust ? "bust" : row.toTarget === 0 ? "zero" : "";

  const tr = document.createElement("tr");
  tr.className = row.leading ? "leading" : "";
  tr.innerHTML = `
    <td class="col-num rank">${i + 1}</td>
    <td class="col-manager manager-name">${row.manager}</td>
    <td class="col-picks"><div class="picks">${picksHtml}</div></td>
    <td class="col-tot tot">${row.total}</td>
    <td class="col-to21 to21 ${toClass}">${toTxt}</td>
    <td class="col-scr scr">${row.scorers}/4</td>
    <td class="col-status"><span class="status-badge ${st.key}">${st.label}</span></td>
  `;
  tr.addEventListener("click", () => openModal(row));
  return tr;
}

function applyFilter(list) {
  switch (currentFilter) {
    case "in": return list.filter((r) => !r.bust);
    case "bust": return list.filter((r) => r.bust);
    case "four": return list.filter((r) => r.allFourScored);
    case "needs": return list.filter((r) => !r.allFourScored && !r.bust);
    default: return list;
  }
}

function renderActual() {
  // non-bust sorted by total desc (ties by scorers desc), bust entries pushed to the bottom
  const notBust = rows.filter((r) => !r.bust).sort((a, b) => b.total - a.total || b.scorers - a.scorers);
  const bust = rows.filter((r) => r.bust).sort((a, b) => b.total - a.total);
  const sorted = [...notBust, ...bust];
  const filtered = applyFilter(sorted).filter(matchesSearch);

  boardBody.innerHTML = "";
  if (!filtered.length) {
    boardBody.innerHTML = `<tr><td colspan="7" class="loading">Nothing matches.</td></tr>`;
    return;
  }
  filtered.forEach((row, i) => boardBody.appendChild(renderRow(row, i)));
}

// ---------- PACE table ----------

function paceBadge(p) {
  const labels = { ahead: "AHEAD OF PACE", on: "ON PACE", behind: "BEHIND PACE", bust: "BUST", "no-data": "NO DATA YET" };
  return `<span class="pace-badge ${p.status}">${labels[p.status] || p.status.toUpperCase()}</span>`;
}

function bustGwCell(row) {
  const p = row.pace;
  if (row.bust) return `<span class="bustgw-cell">—</span>`;
  if (p.bustGw != null) return `<span class="bustgw-cell bustgw">Bust ~GW ${p.bustGw}</span>`;
  if (p.gwsTo21 != null) {
    const cls = p.paceTooSlow ? "slow" : "";
    return `<span class="bustgw-cell ${cls}">GW ${p.gwsTo21}${p.paceTooSlow ? " (too slow)" : ""}</span>`;
  }
  return `<span class="bustgw-cell">—</span>`;
}

function renderPaceRow(row, i) {
  const tr = document.createElement("tr");
  const proj = row.pace.projectedTotal != null ? row.pace.projectedTotal : "—";
  tr.innerHTML = `
    <td class="col-num rank">${i + 1}</td>
    <td class="col-manager manager-name">${row.manager}</td>
    <td class="col-tot tot">${row.total}</td>
    <td class="col-pace pace-value">${paceBadge(row.pace)}</td>
    <td class="col-proj proj-total">${proj}</td>
    <td class="col-bustgw">${bustGwCell(row)}</td>
  `;
  tr.addEventListener("click", () => openModal(row));
  return tr;
}

function renderPace() {
  // rank by closeness of current total to the season's par-so-far, closest first
  const withDiff = rows.map((r) => ({ r, absDiff: r.pace.diffFromPar == null ? Infinity : Math.abs(r.pace.diffFromPar) }));
  withDiff.sort((a, b) => a.absDiff - b.absDiff || b.r.total - a.r.total);
  const sorted = withDiff.map((x) => x.r);
  const filtered = applyFilter(sorted).filter(matchesSearch);

  paceBody.innerHTML = "";
  if (!filtered.length) {
    paceBody.innerHTML = `<tr><td colspan="6" class="loading">Nothing matches.</td></tr>`;
    return;
  }
  filtered.forEach((row, i) => paceBody.appendChild(renderPaceRow(row, i)));
}

function renderPaceBanner() {
  if (!season) { paceBanner.classList.remove("visible"); return; }
  paceBanner.classList.add("visible");
  paceBanner.textContent =
    `${season.gwPlayed} of ${season.totalGameweeks} gameweeks played (${season.pctPlayed}% of the season). ` +
    `A 21-goal season runs at ${season.parRate} goals a matchweek, so par right now is ${season.parNow} goals. ` +
    `Closest to that — over or under — ranks first. Projections this early swing wildly; treat them as a bit of fun until the sample grows.`;
}

// ---------- shared ----------

function render() {
  if (currentTab === "actual") {
    boardActualTable.hidden = false;
    boardPaceTable.hidden = true;
    paceBanner.classList.remove("visible");
    renderActual();
  } else {
    boardActualTable.hidden = true;
    boardPaceTable.hidden = false;
    renderPaceBanner();
    renderPace();
  }
}

function openModal(row) {
  const backdrop = document.getElementById("modal-backdrop");
  const content = document.getElementById("modal-content");
  const flagged = row.picks.filter((p) => p.reason || !p.found);
  const lines = flagged.length
    ? flagged.map((p) => `<p><strong>${p.name}</strong> — ${p.found ? p.reason : "Could not be matched to an FPL player. Check /api/debug."}</p>`).join("")
    : `<p>No flags — every pick is fit and traceable.</p>`;
  const paceLine = row.pace && row.pace.projectedTotal != null
    ? `<p>Pace: projected ${row.pace.projectedTotal} goals by GW38.</p>`
    : "";
  content.innerHTML = `
    <h3>${row.manager}</h3>
    <p>${row.total} goals from ${row.picks.map((p) => p.name).join(", ")}. ${row.scorers}/4 scored.</p>
    ${paceLine}
    ${lines}
    <button id="modal-close">CLOSE</button>
  `;
  backdrop.classList.add("open");
  document.getElementById("modal-close").addEventListener("click", () => {
    backdrop.classList.remove("open");
  });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.classList.remove("open");
  });
}

function renderStats(summary) {
  document.getElementById("stat-goals").textContent = summary.totalGoals;
  document.getElementById("stat-stillin").textContent = summary.stillIn;
  document.getElementById("stat-bust-sub").textContent = `${summary.bustCount} bust`;
  document.getElementById("stat-on21").textContent = summary.on21;
  document.getElementById("stat-fourscorers").textContent = summary.fourScorers;
  document.getElementById("stat-leader").textContent = summary.leader ? summary.leader.manager : "—";
  document.getElementById("stat-leader-sub").textContent = summary.leader ? `${summary.leader.total} goals` : "";
}

async function load() {
  try {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    rows = data.rows;
    season = data.season;
    updatedAt.textContent = `Last updated ${fmtTime(new Date(data.updated))}`;
    renderStats(data.summary);
    render();
  } catch (err) {
    boardBody.innerHTML = `<tr><td colspan="7" class="loading">Couldn't reach the live FPL data. Try refresh.</td></tr>`;
    paceBody.innerHTML = `<tr><td colspan="6" class="loading">Couldn't reach the live FPL data. Try refresh.</td></tr>`;
    console.error(err);
  }
}

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    render();
  });
});

document.getElementById("search").addEventListener("input", (e) => {
  searchTerm = e.target.value.trim();
  render();
});

document.getElementById("refresh-btn").addEventListener("click", load);

document.getElementById("tab-actual-link").addEventListener("click", () => {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector('.tab-btn[data-tab="actual"]').classList.add("active");
  currentTab = "actual";
  render();
});
document.getElementById("tab-pace-link").addEventListener("click", () => {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector('.tab-btn[data-tab="pace"]').classList.add("active");
  currentTab = "pace";
  render();
});
document.querySelector(".fastext-nav .fx-cyan").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

load();
setInterval(load, 60000);
