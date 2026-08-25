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

## Files
- `server.js` — fetches FPL data, computes the leaderboard, serves the API
- `lib/match.js` — name matching (exact → substring → fuzzy/typo-tolerant)
- `data/managers.json` — your 23 managers and their picks (edit here)
- `public/` — the front end (index.html / style.css / app.js)
