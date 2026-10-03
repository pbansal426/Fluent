#!/bin/bash
# Publishes the current code to the live site, but only if it is in good shape:
#   1. the tests must pass   2. the site must build   3. deploy   4. the live site must answer correctly
# Run it from anywhere:   ~/Dev/Fluent/tools/deploy.sh      (or:  npm run deploy)
cd "$(dirname "$0")/.." || exit 1
LIVE="https://fluent-demo-chi.vercel.app"

echo
echo "Publish to $LIVE"
echo "----------------------------------------------"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$BRANCH" != "main" ]; then
  echo "Note: you are on '$BRANCH', not 'main'. This publishes what is in this folder right now."
fi
if [ -n "$(git status --porcelain 2>/dev/null | grep -v '^??')" ]; then
  echo "Note: there are changes in this folder that are not committed yet. They will be published too."
fi

echo
echo "1/4  Running the tests..."
if ! npm test > /tmp/fluent-deploy-tests.txt 2>&1; then
  grep -E "^not ok|^# (tests|pass|fail)" /tmp/fluent-deploy-tests.txt | head
  echo
  echo "Stopped: the tests failed, so nothing was published."
  exit 1
fi
grep -E "^# (tests|pass|fail)" /tmp/fluent-deploy-tests.txt | tr '\n' ' '; echo

echo
echo "2/4  Building the site..."
node tools/build-site.mjs || { echo "Stopped: the site did not build, so nothing was published."; exit 1; }

echo
echo "3/4  Publishing (this takes about a minute)..."
if ! npx --yes vercel deploy --prod --yes > /tmp/fluent-deploy-out.txt 2>&1; then
  tail -8 /tmp/fluent-deploy-out.txt
  echo
  echo "Stopped: Vercel refused the deploy. If it says you are logged out, run:  npx vercel login"
  exit 1
fi

echo
echo "4/4  Checking the live site..."
sleep 3
PAGE=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$LIVE/demo/app/")
CONFIG=$(curl -s -m 30 "$LIVE/config.json")
HIDDEN=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$LIVE/.openrouter-key")
BLOCKED=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST -H 'x-target-url: https://example.com/' "$LIVE/proxy")
OK=1
[ "$PAGE" = "200" ] || { echo "  page: expected 200, got $PAGE"; OK=0; }
echo "$CONFIG" | grep -q '"sharedKey":true' || { echo "  config: shared key not on"; OK=0; }
[ "$HIDDEN" = "404" ] || { echo "  key file: expected 404, got $HIDDEN"; OK=0; }
[ "$BLOCKED" = "403" ] || { echo "  other sites: expected 403, got $BLOCKED"; OK=0; }
if [ "$OK" = "1" ]; then
  echo "  page open, key hidden, other sites blocked."
  echo
  echo "Published: $LIVE"
  echo "(Visitors may need to refresh the page to get the new version.)"
else
  echo
  echo "The live site did not pass its checks. Tell Claude what is shown above."
  exit 1
fi
