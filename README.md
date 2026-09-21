# MKF PL BLACKJACK

Live leaderboard for your 26/27 sweepstake. Node/Express server, no database —
it fetches the official FPL API on a 3-minute cache and matches your players'
names to live goal counts.

## Run locally
```
npm install
npm start
```
Open http://localhost:3000

## Deploy to Render (same as the reference site)
1. Push this folder to a GitHub repo.
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Done — Render sets `PORT` automatically.

## IMPORTANT: check the matches after first deploy
Player names get matched to live FPL players automatically (typos and
accents are handled). Visit **/api/debug** on your deployed URL — it
lists every pick, which FPL player it resolved to, and flags anything
ambiguous (e.g. "Rayan" could mean more than one Man City player).

If a pick is wrong or ambiguous, open `data/managers.json` and pin it
to the exact player with an id override:
```json
{ "manager": "Alex R", "picks": ["Isak", "Calvert-Lewin", "Barry", { "name": "Rayan", "id": 123 }] }
```
Get the id from `/api/debug`, redeploy.

## Correcting a goal (FPL vs official PL data)
FPL's live `goals_scored` can occasionally lag or disagree with the official
Premier League record (attribution disputes, deflections, late corrections).
Rather than switching data sources, add a manual correction to
`data/adjustments.json`:
```json
[
  { "name": "Calvert-Lewin", "delta": 1, "note": "PL credited this goal; FPL had not (as of 24 Aug 2026)." }
]
```
`delta` can be negative too. It applies everywhere that player is picked,
and shows a small **†** marker next to the goal count on the site (hover or
tap for the note) so it's never a silent change. Remove the entry once FPL's
own data catches up — check `/api/debug` to see which corrections are
currently active.

## Files
- `server.js` — fetches FPL data, computes the leaderboard, serves the API
- `lib/match.js` — name matching (exact → substring → fuzzy/typo-tolerant)
- `data/managers.json` — your 23 managers and their picks (edit here)
- `data/adjustments.json` — manual goal corrections (see above)
- `public/` — the front end (index.html / style.css / app.js)
