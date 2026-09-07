#!/usr/bin/env bash
# One-time Cloudflare setup for NFL/26 accounts. Run from the repo root after `npx wrangler login`.
#   1. creates the D1 database (or reuses it)
#   2. writes its id into worker/wrangler.toml
#   3. applies worker/schema.sql
#   4. deploys the Worker and writes its URL into js/config.js
# Safe to re-run: it's a no-op where things already exist. Re-deploy later with:  npx wrangler deploy -c worker/wrangler.toml
set -euo pipefail
cd "$(dirname "$0")/.."
W="npx --yes wrangler@4"

echo "→ Checking Cloudflare login…"
$W whoami >/dev/null 2>&1 || { echo "Not logged in. Run:  npx wrangler login   (then re-run this script)"; exit 1; }

echo "→ Database…"
if ! grep -q 'database_id = "REPLACE_ME"' worker/wrangler.toml; then
  echo "   already configured ($(grep database_id worker/wrangler.toml))"
else
  ID=$($W d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const d=j.find(x=>x.name==="nfl26");console.log(d?d.uuid:"")}catch{console.log("")}})')
  if [ -z "$ID" ]; then
    OUT=$($W d1 create nfl26 2>&1) || { echo "$OUT"; exit 1; }
    ID=$(echo "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
    echo "   created nfl26 ($ID)"
  else
    echo "   found existing nfl26 ($ID)"
  fi
  [ -n "$ID" ] || { echo "Could not read the database id."; exit 1; }
  sed -i.bak "s/database_id = \"REPLACE_ME\"/database_id = \"$ID\"/" worker/wrangler.toml && rm -f worker/wrangler.toml.bak
fi

echo "→ Tables…"
$W d1 execute nfl26 --remote --file=worker/schema.sql -c worker/wrangler.toml -y >/dev/null
echo "   ok"

echo "→ Deploying Worker…"
OUT=$($W deploy -c worker/wrangler.toml 2>&1) || { echo "$OUT"; exit 1; }
URL=$(echo "$OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$URL" ] || { echo "$OUT"; echo "Deployed, but could not read the Worker URL from the output above."; exit 1; }
echo "   live at $URL"

echo "→ Pointing the app at it…"
printf "// Filled in by tools/cf-setup.sh after the Worker is deployed. Empty = accounts are off (app works on-device only).\nexport const API_URL = '%s';\n" "$URL" > js/config.js
echo "   js/config.js updated"

echo
echo "Done. Now commit and push:"
echo "  git add worker/wrangler.toml js/config.js && git commit -m 'Cloudflare accounts live' && git push"
