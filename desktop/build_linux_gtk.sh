#!/usr/bin/env bash
# Build the small Linux version of the WCH Configurator desktop app that uses the
# system WebKitGTK (pywebview GTK backend) instead of a bundled Qt WebEngine.
#
#   bash desktop/build_linux_gtk.sh [path/to/index.html]
#
# Output: desktop/dist/WCH-Configurator-linux-gtk.tar.gz (about 1 MB) with
#
#   WCH-Configurator-gtk/
#     wch-configurator        launcher (checks the runtime packages, then starts the app)
#     app/                    wch_configurator.py, index.html, icon.ico
#     lib/                    pywebview + bottle, proxy_tools, typing_extensions (pure Python)
#     wch-configurator.desktop, README-GTK.txt
#
# Nothing is compiled: the app runs on the system python3 with the distribution's
# PyGObject and WebKitGTK. Runtime packages (see README-GTK.txt):
#   Debian 12+/Ubuntu 22.04+:  sudo apt install python3 python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1
#   Fedora:                    sudo dnf install python3 python3-gobject gtk3 webkit2gtk4.1
#   Arch:                      sudo pacman -S python python-gobject gtk3 webkit2gtk-4.1
#   openSUSE:                  sudo zypper install python3 python3-gobject-Gdk typelib-1_0-WebKit2-4_1
# Older systems with only WebKit2 4.0 (gir1.2-webkit2-4.0) work too (pywebview falls back).
#
# Build requirements: python3 with pip (any Linux, any architecture: the result is
# architecture independent).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
INDEX="${1:-$REPO/index.html}"
[ -f "$INDEX" ] || { echo "index.html not found: $INDEX" >&2; exit 1; }
NAME=WCH-Configurator-gtk
BUILD="$HERE/build/linux-gtk"
STAGE="$BUILD/$NAME"
DIST="$HERE/dist"
rm -rf "$BUILD"; mkdir -p "$STAGE/app" "$STAGE/lib" "$DIST"

echo "-> pywebview (pure Python, no GUI toolkit wheels)"
PIP_BREAK_SYSTEM_PACKAGES=1 python3 -m pip install --disable-pip-version-check -q --no-compile --no-deps --target "$STAGE/lib" -r "$HERE/requirements-linux-gtk.txt"
# only the GTK backend is used: drop the other platform backends and package metadata
find "$STAGE/lib/webview/platforms" -maxdepth 1 -type f ! -name 'gtk.py' ! -name '__init__.py' -delete 2>/dev/null || true
rm -rf "$STAGE/lib/bin" "$STAGE"/lib/*.dist-info/RECORD

cp "$HERE/wch_configurator.py" "$INDEX" "$HERE/icon.ico" "$STAGE/app/"
[ "$(basename "$INDEX")" = index.html ] || mv "$STAGE/app/$(basename "$INDEX")" "$STAGE/app/index.html"

cat > "$STAGE/wch-configurator" <<'EOF'
#!/bin/sh
# WCH Configurator (desktop, WebKitGTK). Original tool by Amir1387aht (Another):
# https://github.com/amir1387aht/WCH-Resources
#   ./wch-configurator [project folder | file.wchproj] [--debug]
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
PY="${WCH_PYTHON:-python3}"
command -v "$PY" >/dev/null 2>&1 || { echo "python3 is not installed." >&2; echo "Debian/Ubuntu: sudo apt install python3 python3-gi gir1.2-webkit2-4.1" >&2; exit 1; }
if ! "$PY" -s - <<'PYCHECK' 2>/dev/null
import gi
gi.require_version("Gtk", "3.0")
try:
    gi.require_version("WebKit2", "4.1")
except ValueError:
    gi.require_version("WebKit2", "4.0")
from gi.repository import Gtk, WebKit2
PYCHECK
then
  echo "WCH Configurator needs PyGObject and WebKitGTK from your distribution:" >&2
  echo "  Debian 12+ / Ubuntu 22.04+: sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1" >&2
  echo "  Fedora:                     sudo dnf install python3-gobject gtk3 webkit2gtk4.1" >&2
  echo "  Arch:                       sudo pacman -S python-gobject gtk3 webkit2gtk-4.1" >&2
  echo "  openSUSE:                   sudo zypper install python3-gobject-Gdk typelib-1_0-WebKit2-4_1" >&2
  exit 1
fi
if [ "${1:-}" = "--install-desktop-entry" ]; then
  d="${XDG_DATA_HOME:-$HOME/.local/share}/applications"; mkdir -p "$d"
  sed "s#@EXEC@#$HERE/wch-configurator#" "$HERE/wch-configurator.desktop" > "$d/wch-configurator.desktop"
  echo "Menu entry written to $d/wch-configurator.desktop"; exit 0
fi
export PYTHONPATH="$HERE/lib${PYTHONPATH:+:$PYTHONPATH}"
export WCH_GUI="${WCH_GUI:-gtk}"
exec "$PY" -s "$HERE/app/wch_configurator.py" "$@"
EOF
chmod +x "$STAGE/wch-configurator"

cat > "$STAGE/wch-configurator.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=WCH Configurator
Comment=Pin, clock and peripheral configurator for WCH RISC-V MCUs (by Amir1387aht)
Exec="@EXEC@" %f
Terminal=false
Categories=Development;Electronics;
MimeType=application/x-wchproj;
EOF

cat > "$STAGE/README-GTK.txt" <<'EOF'
WCH Configurator - desktop app for Linux (WebKitGTK build)
Original tool: WCH Configurator by Amir1387aht (Another)
https://github.com/amir1387aht/WCH-Resources

This build is small because it uses the web engine of your Linux system
(WebKitGTK) through Python. The other Linux download (WCH-Configurator-linux-x86_64)
brings its own Qt WebEngine and needs no Python packages.

Runtime packages:
  Debian 12+ / Ubuntu 22.04+ / Mint 21+:
      sudo apt install python3 python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1
  Fedora 37+:
      sudo dnf install python3 python3-gobject gtk3 webkit2gtk4.1
  Arch / Manjaro:
      sudo pacman -S python python-gobject gtk3 webkit2gtk-4.1
  openSUSE Tumbleweed:
      sudo zypper install python3 python3-gobject-Gdk typelib-1_0-WebKit2-4_1
  Older systems with only WebKit2 4.0 (gir1.2-webkit2-4.0, webkit2gtk3) work too.

Start:
  ./wch-configurator
  ./wch-configurator <project folder or file.wchproj>
  ./wch-configurator --install-desktop-entry      (adds a menu entry)

If the window stays white (some virtual machines / NVIDIA drivers), try:
  WEBKIT_DISABLE_DMABUF_RENDERER=1 ./wch-configurator
EOF

tar -C "$BUILD" -czf "$DIST/WCH-Configurator-linux-gtk.tar.gz" "$NAME"
echo
echo "OK -> $DIST/WCH-Configurator-linux-gtk.tar.gz ($(du -h "$DIST/WCH-Configurator-linux-gtk.tar.gz" | cut -f1))"
