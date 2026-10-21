#!/usr/bin/env python3
"""Build the handpan song catalogue, serve the trainer locally and watch for song changes."""

from __future__ import annotations

import functools
import http.server
import json
import pathlib
import re
import threading
import time
import webbrowser
from typing import Optional


PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEMO_DIRECTORY = PROJECT_ROOT / "demo-songs"
CATALOG_PATH = PROJECT_ROOT / "app-files" / "song-catalog.js"


def slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return result or "song"


def read_song(path: pathlib.Path) -> Optional[dict]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        song = document.get("song", {})
        if not song.get("title") or not song.get("sequence") or not song.get("bpm"):
            raise ValueError("the file does not contain a complete song")
        song["id"] = "demo-" + slug(path.stem)
        song["builtIn"] = True
        song["folder"] = "demo"
        return song
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f"Skipped {path.name}: {error}")
        return None


def write_catalog() -> None:
    songs = [s for s in (read_song(p) for p in sorted(DEMO_DIRECTORY.glob("*.handsong"))) if s]
    songs.sort(key=lambda s: (s.get("order", 999), s.get("title", "").lower()))
    payload = json.dumps(songs, ensure_ascii=False, indent=1)
    CATALOG_PATH.write_text(
        f"window.HANDPAN_CATALOG_VERSION = '{time.time_ns()}';\nwindow.HANDPAN_DEMO_SONGS = {payload};\n",
        encoding="utf-8",
    )
    print(f"Song catalogue updated: {len(songs)} demo song(s).")


def snapshot() -> tuple:
    result = []
    for path in sorted(DEMO_DIRECTORY.glob("*.handsong")):
        try:
            details = path.stat()
            result.append((path.name, details.st_mtime_ns, details.st_size))
        except OSError:
            pass
    return tuple(result)


def main() -> None:
    DEMO_DIRECTORY.mkdir(exist_ok=True)
    write_catalog()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(PROJECT_ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    address = f"http://127.0.0.1:{server.server_address[1]}/index.html"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print()
    print(f"Hand Drum Trainer is running at {address}")
    print("Watching the demo-songs folder. Keep this window open. Press Ctrl+C to stop.")
    print()
    threading.Timer(0.35, lambda: webbrowser.open(address)).start()
    previous = snapshot()
    try:
        while True:
            time.sleep(1)
            current = snapshot()
            if current != previous:
                time.sleep(0.2)
                write_catalog()
                previous = snapshot()
    except KeyboardInterrupt:
        print("\nStopping Hand Drum Trainer.")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
