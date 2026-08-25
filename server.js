const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = 21;
const TOTAL_GAMEWEEKS = 38;
const CACHE_MS = 3 * 60 * 1000; // refresh live data every 3 minutes
const FPL_BOOTSTRAP = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FPL_FIXTURES = "https://fantasy.premierleague.com/api/fixtures/";

const { buildIndex, matchPlayer } = require("./lib/match");

const managers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "managers.json"), "utf8")
);

// ---------- FPL data cache ----------

let cache = { at: 0, index: null, raw: null, gwProgress: null, teamMap: null };

const FPL_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://fantasy.premierleague.com/",
};

async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// Fraction of the season played so far, counted in gameweeks (e.g. 0.9 of 38):
// for every gameweek, the share of its fixtures that have gone final. We use
// finished_provisional (flips at full-time) rather than finished (which can
// lag by hours/days while bonus points and stats get officially checked) —
// otherwise goals already on the board wouldn't count as "played" yet.
function computeGwProgress(events, fixtures) {
  const byEvent = {};
  fixtures.forEach((f) => {
    if (f.event == null) return;
    if (!byEvent[f.event]) byEvent[f.event] = { total: 0, done: 0 };
    byEvent[f.event].total++;
    if (f.finished_provisional) byEvent[f.event].done++;
  });
  let played = 0;
  Object.values(byEvent).forEach((e) => {
    if (e.total > 0) played += e.done / e.total;
  });
  const current = events.find((e) => e.is_current) || events.find((e) => e.is_next);
  return { played: Math.round(played * 100) / 100, currentEvent: current ? current.id : null };
}

async function getData() {
  const isFresh = cache.index && Date.now() - cache.at < CACHE_MS;
  if (isFresh) return cache;

  try {
    const [bootRes, fixRes] = await Promise.all([
      fetchWithTimeout(FPL_BOOTSTRAP, { headers: FPL_HEADERS }, 10000),
      fetchWithTimeout(FPL_FIXTURES, { headers: FPL_HEADERS }, 10000),
    ]);
    if (!bootRes.ok) throw new Error(`FPL bootstrap API ${bootRes.status}`);
    if (!fixRes.ok) throw new Error(`FPL fixtures API ${fixRes.status}`);
    const json = await bootRes.json();
    const fixtures = await fixRes.json();
    const index = buildIndex(json.elements);
    const gwProgress = computeGwProgress(json.events, fixtures);
    const teamMap = {};
    (json.teams || []).forEach((t) => { teamMap[t.id] = t.short_name; });
    cache = { at: Date.now(), index, raw: json, gwProgress, teamMap };
    return cache;
  } catch (err) {
    if (cache.index) {
      console.error("FPL fetch failed, serving stale cache:", err.message);
      return cache;
    }
    throw err;
  }
}

function statusReason(p) {
  if (p.status === "i") return p.news || "Injured";
  if (p.status === "d") return p.news || "Doubtful";
  if (p.status === "s") return p.news || "Suspended";
  if (p.status === "u") return p.news || "Unavailable";
  return null;
}

async function buildLeaderboard() {
  const { index, gwProgress, teamMap } = await getData();
  const gwPlayed = gwProgress ? gwProgress.played : 0;
  const parRate = TARGET / TOTAL_GAMEWEEKS; // goals per gameweek to land exactly on 21
  const parNow = Math.round(parRate * gwPlayed * 100) / 100;
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
        return { name: queryName, id: null, goals: 0, found: false, reason: "No match found", teamShort: null };
      }
      const p = match.player;
      return {
        name: p.web_name,
        id: p.id,
        goals: p.goals_scored,
        found: true,
        ambiguous: match.ambiguous || false,
        reason: statusReason(p),
        teamShort: teamMap ? teamMap[p.team] || null : null,
      };
    });

    const total = picks.reduce((s, p) => s + p.goals, 0);
    const scorers = picks.filter((p) => p.goals > 0).length;
    const bust = total > TARGET;
    const allFourScored = scorers === 4;
    const toTarget = bust ? null : TARGET - total;

    // ---- pace ----
    const rate = gwPlayed > 0 ? total / gwPlayed : 0; // goals per gameweek so far
    const projectedTotal = gwPlayed > 0 ? Math.round(rate * TOTAL_GAMEWEEKS * 10) / 10 : null;
    let bustGw = null; // gameweek number projected to cross 21
    let gwsTo21 = null; // gameweeks needed to reach 21 at current rate
    let paceTooSlow = false;
    if (rate > 0) {
      const gwToHit21 = TARGET / rate;
      if (gwToHit21 <= TOTAL_GAMEWEEKS) {
        bustGw = Math.ceil(gwToHit21);
      } else {
        gwsTo21 = Math.round(gwToHit21 * 10) / 10;
        paceTooSlow = true;
      }
    }
    const diff = gwPlayed > 0 ? Math.round((total - parNow) * 100) / 100 : null;
    let paceStatus = "no-data";
    if (bust) paceStatus = "bust";
    else if (gwPlayed > 0) {
      if (Math.abs(diff) < 0.5) paceStatus = "on";
      else if (diff > 0) paceStatus = "ahead";
      else paceStatus = "behind";
    }

    return {
      manager: m.manager,
      picks,
      total,
      scorers,
      toTarget,
      bust,
      allFourScored,
      eligible: allFourScored && !bust,
      pace: {
        status: paceStatus,
        diffFromPar: diff,
        projectedTotal,
        bustGw,
        gwsTo21,
        paceTooSlow,
      },
    };
  });

  // ranking badge for the ACTUAL table: highest total among 4-scorer, non-bust entries
  const eligible = rows.filter((r) => r.eligible);
  const bestEligibleTotal = eligible.length ? Math.max(...eligible.map((r) => r.total)) : null;
  rows.forEach((r) => {
    r.leading = r.eligible && r.total === bestEligibleTotal;
  });

  // header stat: top total among anyone not yet bust, regardless of 4-scorer eligibility
  const notBust = rows.filter((r) => !r.bust);
  let topManager = null;
  if (notBust.length) {
    topManager = notBust.reduce((best, r) => {
      if (!best) return r;
      if (r.total !== best.total) return r.total > best.total ? r : best;
      return r.scorers > best.scorers ? r : best;
    }, null);
  }

  const summary = {
    managerCount: rows.length,
    totalGoals: rows.reduce((s, r) => s + r.total, 0),
    stillIn: rows.filter((r) => !r.bust).length,
    bustCount: rows.filter((r) => r.bust).length,
    on21: rows.filter((r) => !r.bust && r.total === TARGET).length,
    fourScorers: eligible.length,
    leader: topManager ? { manager: topManager.manager, total: topManager.total } : null,
  };

  return {
    rows,
    updated: new Date().toISOString(),
    debug,
    summary,
    season: {
      totalGameweeks: TOTAL_GAMEWEEKS,
      gwPlayed,
      parRate: Math.round(parRate * 1000) / 1000,
      parNow,
      pctPlayed: Math.round((gwPlayed / TOTAL_GAMEWEEKS) * 1000) / 10,
    },
  };
}

// ---------- routes ----------

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/leaderboard", async (req, res) => {
  try {
    const data = await buildLeaderboard();
    res.json({
      rows: data.rows,
      updated: data.updated,
      target: TARGET,
      summary: data.summary,
      season: data.season,
    });
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
