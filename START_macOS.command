#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 "app-files/start-trainer.py"
fi
echo "Python 3 is required to run the downloaded trainer on macOS."
echo "Install it from https://www.python.org/downloads/ and try again."
read -r -p "Press Return to close."
