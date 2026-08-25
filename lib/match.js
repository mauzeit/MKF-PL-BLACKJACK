function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function buildIndex(elements) {
  return elements.map((el) => ({
    id: el.id,
    web_name: el.web_name,
    full_name: `${el.first_name} ${el.second_name}`.trim(),
    known_name: el.known_name || "",
    n_web: normalize(el.web_name),
    n_second: normalize(el.second_name),
    n_first: normalize(el.first_name || ""),
    n_full: normalize(`${el.first_name}${el.second_name}`),
    n_known: normalize(el.known_name || ""),
    selected_by_percent: parseFloat(el.selected_by_percent || "0"),
    goals_scored: el.goals_scored || 0,
    status: el.status,
    news: el.news || "",
    team: el.team,
  }));
}

function matchPlayer(query, index) {
  const nq = normalize(query);
  if (!nq) return null;

  let exact = index.filter(
    (p) => p.n_web === nq || p.n_second === nq || p.n_full === nq || p.n_known === nq
  );
  if (exact.length === 1) return { player: exact[0], score: 0, ambiguous: false };
  if (exact.length > 1) {
    exact.sort((a, b) => b.selected_by_percent - a.selected_by_percent);
    return { player: exact[0], score: 0, ambiguous: true, alternates: exact };
  }

  let contains = index.filter(
    (p) => p.n_web.includes(nq) || nq.includes(p.n_web) ||
           p.n_second.includes(nq) || nq.includes(p.n_second)
  );
  if (contains.length) {
    contains.sort((a, b) => b.selected_by_percent - a.selected_by_percent);
    return { player: contains[0], score: 1, ambiguous: contains.length > 1, alternates: contains };
  }

  // first-name-only match (e.g. a query like "Rayan" matching multiple players)
  let byFirst = index.filter((p) => p.n_first === nq);
  if (byFirst.length) {
    byFirst.sort((a, b) => b.selected_by_percent - a.selected_by_percent);
    return { player: byFirst[0], score: 1.5, ambiguous: byFirst.length > 1, alternates: byFirst };
  }

  let best = null, bestDist = Infinity;
  for (const p of index) {
    const d = Math.min(
      levenshtein(nq, p.n_web),
      levenshtein(nq, p.n_second),
      levenshtein(nq, p.n_full)
    );
    if (d < bestDist) { bestDist = d; best = p; }
  }
  const threshold = Math.max(2, Math.floor(nq.length * 0.34));
  if (best && bestDist <= threshold) {
    return { player: best, score: 2 + bestDist, ambiguous: false };
  }
  return null;
}

module.exports = { normalize, levenshtein, buildIndex, matchPlayer };
