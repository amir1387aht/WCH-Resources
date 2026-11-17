#!/usr/bin/env bash
# Build the WCH Configurator desktop app for Linux (x86_64) as one executable file.
#
#   bash desktop/build_linux.sh [path/to/index.html]
#
# The window uses Qt WebEngine (PyQt6), which is bundled into the file, so the
# result does not depend on the WebKitGTK version of the target system. Build on
# the oldest distribution you want to support (glibc is not bundled); the release
# build is made on Ubuntu 22.04.
#
# Build requirements: python3 (3.10+) with venv, and the Qt runtime libraries
# (Ubuntu/Debian: see "apt" below).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
INDEX="${1:-$REPO/index.html}"
[ -f "$INDEX" ] || { echo "index.html not found: $INDEX" >&2; exit 1; }
BUILD="$HERE/build/linux"
DIST="$HERE/dist"
mkdir -p "$BUILD" "$DIST"

if [ ! -x "$BUILD/venv/bin/python" ]; then
  echo "-> creating build venv"
  python3 -m venv "$BUILD/venv"
fi
PY="$BUILD/venv/bin/python"
"$PY" -m pip install --disable-pip-version-check -q --upgrade pip
"$PY" -m pip install --disable-pip-version-check -q -r "$HERE/requirements-linux.txt" pyinstaller

cp "$INDEX" "$BUILD/index.html"
cp "$HERE/icon.ico" "$BUILD/icon.ico"
"$PY" -m PyInstaller --noconfirm --clean --onefile --windowed \
  --name WCH-Configurator \
  --distpath "$DIST" --workpath "$BUILD/work" --specpath "$BUILD" \
  --add-data "$BUILD/index.html:." --add-data "$BUILD/icon.ico:." \
  --collect-submodules webview \
  "$HERE/wch_configurator.py"

OUT="$DIST/WCH-Configurator"
chmod +x "$OUT"
echo
echo "OK -> $OUT"
echo "   $(du -h "$OUT" | cut -f1), SHA256 $(sha256sum "$OUT" | cut -d' ' -f1)"
echo
echo "Run it on a desktop with:  $OUT"
echo "Qt needs these system libraries (Ubuntu/Debian):"
echo "  sudo apt install libxcb-cursor0 libxkbcommon-x11-0 libegl1 libnss3"
