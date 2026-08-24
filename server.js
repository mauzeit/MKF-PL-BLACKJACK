const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = 21;
const CACHE_MS = 3 * 60 * 1000; // refresh live data every 3 minutes
const FPL_BOOTSTRAP = "https://fantasy.premierleague.com/api/bootstrap-static/";

const { buildIndex, matchPlayer } = require("./lib/match");

const managers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "managers.json"), "utf8")
);

// ---------- FPL data cache ----------

let cache = { at: 0, index: null, raw: null };

async function getIndex() {
  if (cache.index && Date.now() - cache.at < CACHE_MS) return cache.index;
  const res = await fetch(FPL_BOOTSTRAP, {
    headers: { "User-Agent": "Mozilla/5.0 (MKF-PL-Blackjack)" },
  });
  if (!res.ok) throw new Error(`FPL API ${res.status}`);
  const json = await res.json();
  const index = buildIndex(json.elements);
  cache = { at: Date.now(), index, raw: json };
  return index;
}

function statusReason(p) {
  if (p.status === "i") return p.news || "Injured";
  if (p.status === "d") return p.news || "Doubtful";
  if (p.status === "s") return p.news || "Suspended";
  if (p.status === "u") return p.news || "Unavailable";
  return null;
}

async function buildLeaderboard() {
  const index = await getIndex();
  const debug = [];

  const rows = managers.map((m) => {
    const picks = m.picks.map((name) => {
      const override = typeof name === "object" ? name : null;
      const queryName = override ? override.name : name;
      let match;
      if (override && override.id) {
        const p = index.find((x) => x.id === override.id);
        match = p ? { player: p, score: 0, ambiguous: false } : null;
      } else {
        match = matchPlayer(queryName, index);
      }
      debug.push({ manager: m.manager, query: queryName, match });
      if (!match) {
        return { name: queryName, id: null, goals: 0, found: false, reason: "No match found" };
      }
      const p = match.player;
      return {
        name: p.web_name,
        id: p.id,
        goals: p.goals_scored,
        found: true,
        ambiguous: match.ambiguous || false,
        reason: statusReason(p),
      };
    });

    const total = picks.reduce((s, p) => s + p.goals, 0);
    const scorers = picks.filter((p) => p.goals > 0).length;
    const bust = total > TARGET;
    const allFourScored = scorers === 4;
    const toTarget = bust ? null : TARGET - total;

    return {
      manager: m.manager,
      picks,
      total,
      scorers,
      toTarget,
      bust,
      allFourScored,
      eligible: allFourScored && !bust,
    };
  });

  // ranking: eligible (4 scorers, not bust) closest to 21 wins; ties split
  const eligible = rows.filter((r) => r.eligible);
  const bestTotal = eligible.length ? Math.max(...eligible.map((r) => r.total)) : null;
  rows.forEach((r) => {
    r.leading = r.eligible && r.total === bestTotal;
  });

  return { rows, updated: new Date().toISOString(), debug };
}

// ---------- routes ----------

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/leaderboard", async (req, res) => {
  try {
    const data = await buildLeaderboard();
    res.json({ rows: data.rows, updated: data.updated, target: TARGET });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not load live FPL data", detail: String(err) });
  }
});

// Inspect how each pick resolved to an FPL player — check this after first deploy
app.get("/api/debug", async (req, res) => {
  try {
    const data = await buildLeaderboard();
    res.json(
      data.debug.map((d) => ({
        manager: d.manager,
        query: d.query,
        matched: d.match ? d.match.player.web_name : null,
        id: d.match ? d.match.player.id : null,
        ambiguous: d.match ? !!d.match.ambiguous : null,
        alternates: d.match && d.match.alternates
          ? d.match.alternates.map((a) => `${a.web_name} (${a.id})`)
          : [],
      }))
    );
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.listen(PORT, () => console.log(`MKF PL BLACKJACK running on :${PORT}`));
