#!/bin/bash
# Shares the Fluent demo on a public link, in one window. Run it with:   ~/Dev/Fluent/tools/share-demo.sh
# It asks for your OpenRouter key (hidden as you paste), starts the demo, and prints the public https:// link.
# Press Ctrl-C to stop everything. Set NO_TUNNEL=1 to run the demo only (no public link).
cd "$(dirname "$0")/.." || exit 1
PORT="${PORT:-8765}"
export PORT

echo
echo "Fluent demo: share on a public link"
echo "-----------------------------------"

# Is something already using the port?
if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is already in use (another demo window is probably still running)."
  echo "Close that window (or press Ctrl-C in it), then run this again."
  exit 1
fi

# 1. The key: use the saved one if there is one (nothing to paste). Otherwise ask once, hidden, and offer to save it.
KEYFILE=".openrouter-key"
if [ -z "$OPENROUTER_API_KEY" ] && [ -s "$KEYFILE" ]; then
  echo "Using the key saved in $(pwd)/$KEYFILE (delete that file to forget it)."
  OPENROUTER_API_KEY=$(cat "$KEYFILE")
  SAVED=1
fi
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "Paste your OpenRouter key and press Enter."
  echo "(Nothing will appear while you paste. That is normal: it is hidden on purpose.)"
  read -r -s -p "Key: " OPENROUTER_API_KEY
  echo
fi
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "No key entered, so nothing was started."
  exit 1
fi
# Copying a key from a web page can bring invisible characters along. Remove anything that is not a normal visible character.
CLEANED=$(printf '%s' "$OPENROUTER_API_KEY" | LC_ALL=C tr -cd '\041-\176')
if [ "$CLEANED" != "$OPENROUTER_API_KEY" ]; then
  echo "(Removed invisible characters that came along with the pasted key.)"
  OPENROUTER_API_KEY="$CLEANED"
fi
case "$OPENROUTER_API_KEY" in
  sk-or-*) ;;
  *) echo "Note: that does not look like an OpenRouter key (they start with sk-or-). Continuing anyway." ;;
esac
export OPENROUTER_API_KEY

if [ -z "$SAVED" ]; then
  read -r -n 1 -p "Save this key on this computer so you never have to paste it again? (y/n) " SAVE
  echo
  if [ "$SAVE" = "y" ] || [ "$SAVE" = "Y" ]; then
    ( umask 077; printf '%s\n' "$OPENROUTER_API_KEY" > "$KEYFILE" )
    echo "Saved. Next time just run this script: it will not ask again."
  fi
fi

# 2. The demo
node tools/demo-server.mjs &
SERVER=$!
STOPPED=""
stop_all() {
  [ -n "$STOPPED" ] && return
  STOPPED=1
  kill $SERVER 2>/dev/null
  echo
  echo "Stopped. The public link no longer works."
}
trap stop_all EXIT INT TERM
sleep 1
if ! kill -0 $SERVER 2>/dev/null; then
  echo "The demo did not start. Scroll up for the reason."
  exit 1
fi

if [ -n "$NO_TUNNEL" ]; then
  echo "Demo only (no public link): open http://localhost:${PORT}/demo/app/"
  wait $SERVER
  exit 0
fi

# 3. The public link
echo
echo "Opening the public link. In a few seconds a line with  https://something.lhr.life  appears below."
echo "That address is what you share. Keep this window open. Press Ctrl-C when you are done."
echo
ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R 80:127.0.0.1:${PORT} nokey@localhost.run
