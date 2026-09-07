# NFL/26 — 2026 NFL Season Dashboard

Live scores, kickoff times, venues, TV networks, how-to-watch (built around the streaming services you actually have),
division standings, the 14-team playoff picture and a Sunday channel-guide grid. Static site, no build step;
optional accounts on Cloudflare (Worker + D1) so your setup follows you across devices.

Sister project of CFB/26 (college football); same architecture, NFL data.

## Run
Open `index.html` from any static host (Vercel: import the repo, no settings). Data comes from ESPN's public
scoreboard/standings/team endpoints straight from the browser.

## Accounts (optional)
`npx wrangler login && tools/cf-setup.sh` — creates the D1 database, deploys the Worker, and points `js/config.js` at it.
Admins (private stats page at `#/stats`): `ADMIN_EMAILS` in `worker/wrangler.toml`.

## Notes
- Week calendar: 18 regular-season weeks + Wild Card, Divisional, Conference, Super Bowl (from ESPN's calendar).
- Playoff picture: ESPN's `playoffSeed` when published; otherwise projected from record + point differential (labeled).
- Win probability: ESPN live probability in-game; the betting line before kickoff; a stats model as a fallback.
- Stadium photos in the Home hero come from each team's ESPN franchise venue.
- Test rig: `npm run shots` (Playwright, mocked ESPN from `tools/samples/`, iPhone + desktop).
