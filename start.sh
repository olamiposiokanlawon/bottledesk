#!/bin/sh
# Starts BottleDesk (screen + server) on this computer.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org and try again."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing what the app needs (first run only, needs internet)..."
  npm install || { echo "npm install failed."; exit 1; }
fi
if [ ! -d dist ]; then
  echo "Preparing the app (first run only)..."
  npm run build || { echo "Build failed."; exit 1; }
fi
( sleep 2; (command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:3000) || (command -v open >/dev/null 2>&1 && open http://localhost:3000) ) >/dev/null 2>&1 &
node server/index.js
