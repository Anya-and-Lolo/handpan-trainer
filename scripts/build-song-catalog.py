#!/usr/bin/env python3
"""Generate app-files/song-catalog.js from demo-songs/ and community-songs/ (*.handsong).

Used by the GitHub Actions workflow in .github/workflows/song-catalog.yml.
"""
from __future__ import annotations
import json
import pathlib
import re
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
FOLDERS = (('demo', ROOT / 'demo-songs'), ('community', ROOT / 'community-songs'))
OUTPUT = ROOT / 'app-files' / 'song-catalog.js'


def slug(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-') or 'song'


def read_folder(folder: str, directory: pathlib.Path) -> list[dict]:
    directory.mkdir(exist_ok=True)
    songs: list[dict] = []
    for path in sorted(directory.glob('*.handsong')):
        try:
            document = json.loads(path.read_text(encoding='utf-8'))
            song = dict(document.get('song') or {})
            if not song.get('title') or not song.get('sequence') or not song.get('bpm'):
                raise ValueError('missing title, sequence or bpm')
            song['id'] = f'{folder}-' + slug(path.stem)
            song['builtIn'] = True
            song['folder'] = folder
            songs.append(song)
        except Exception as exc:
            raise SystemExit(f'Invalid song file {path}: {exc}') from exc
    songs.sort(key=lambda s: (s.get('order', 999), s.get('title', '').lower()))
    return songs


def main() -> None:
    demo = read_folder(*FOLDERS[0])
    community = read_folder(*FOLDERS[1])
    OUTPUT.write_text(
        f"window.HANDPAN_CATALOG_VERSION = '{time.time_ns()}';\n"
        f"window.HANDPAN_DEMO_SONGS = {json.dumps(demo, ensure_ascii=False, indent=1)};\n"
        f"window.HANDPAN_COMMUNITY_SONGS = {json.dumps(community, ensure_ascii=False, indent=1)};\n",
        encoding='utf-8',
    )
    print(f'Built catalogue: {len(demo)} demo, {len(community)} community song(s).')


if __name__ == '__main__':
    main()
