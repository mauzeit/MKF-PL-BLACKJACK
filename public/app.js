let currentFilter = "all";
let rows = [];

const boardBody = document.getElementById("board-body");
const updatedAt = document.getElementById("updated-at");
const ticker = document.getElementById("ticker");

function fmtTime(d) {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function tick() {
  ticker.textContent = `MKF BLACKJACK — ${fmtTime(new Date())}`;
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

function renderRow(row, i) {
  const st = statusFor(row);
  const picksHtml = row.picks
    .map((p) => {
      const zeroClass = p.goals === 0 ? "zero" : "";
      const nf = !p.found ? "notfound" : "";
      const label = p.found ? p.name : `${p.name}?`;
      return `<span class="pick-chip ${zeroClass} ${nf}" title="${p.reason || ""}">${label} <span class="g">${p.found ? p.goals : "—"}</span> ${flagFor(p)}</span>`;
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

function render() {
  const sorted = [...rows].sort((a, b) => {
    if (a.leading !== b.leading) return a.leading ? -1 : 1;
    if (a.bust !== b.bust) return a.bust ? 1 : -1;
    return (b.total || 0) - (a.total || 0);
  });
  const filtered = applyFilter(sorted);
  boardBody.innerHTML = "";
  if (!filtered.length) {
    boardBody.innerHTML = `<tr><td colspan="7" class="loading">Nothing to show for this filter.</td></tr>`;
    return;
  }
  filtered.forEach((row, i) => boardBody.appendChild(renderRow(row, i)));
}

function openModal(row) {
  const backdrop = document.getElementById("modal-backdrop");
  const content = document.getElementById("modal-content");
  const flagged = row.picks.filter((p) => p.reason || !p.found);
  const lines = flagged.length
    ? flagged.map((p) => `<p><strong>${p.name}</strong> — ${p.found ? p.reason : "Could not be matched to an FPL player. Check /api/debug."}</p>`).join("")
    : `<p>No flags — every pick is fit and traceable.</p>`;
  content.innerHTML = `
    <h3>${row.manager}</h3>
    <p>${row.total} goals from ${row.picks.map((p) => p.name).join(", ")}. ${row.scorers}/4 scored.</p>
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

async function load() {
  try {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    rows = data.rows;
    updatedAt.textContent = `Last updated ${fmtTime(new Date(data.updated))}`;
    render();
  } catch (err) {
    boardBody.innerHTML = `<tr><td colspan="7" class="loading">Couldn't reach the live FPL data. Try refresh.</td></tr>`;
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

document.getElementById("refresh-btn").addEventListener("click", load);

load();
setInterval(load, 60000);
