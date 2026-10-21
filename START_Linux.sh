#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 "app-files/start-trainer.py"
fi
echo "Python 3 is required to run the downloaded trainer on Linux."
echo "Install Python 3 with your system package manager and try again."
read -r -p "Press Enter to close."
