#!/usr/bin/env bash
# Build the macOS version of the WCH Configurator desktop app (WCH-Configurator.app).
#
#   bash desktop/build_macos.sh [path/to/index.html]
#
# The window uses the system WKWebView through pywebview's Cocoa backend (pyobjc),
# so the app is small and needs nothing installed. The .app is built for the
# architecture of the Python that runs this script (arm64 on Apple silicon).
# Set TARGET_ARCH=universal2 to build a universal app (needs a universal2 Python,
# e.g. the python.org installer).
#
# Output: desktop/dist/WCH-Configurator.app and desktop/dist/WCH-Configurator-macos-<arch>.zip
#
# The app is not signed or notarized. On first start macOS says it "cannot be
# opened": right-click the app > Open, or run
#   xattr -dr com.apple.quarantine /Applications/WCH-Configurator.app
#
# Build requirements: macOS 12+, python3 (3.10+) with venv. desktop/wch_configurator.py
# must contain the macOS changes (python3 desktop/patch_macos.py, already applied on
# the desktop-app branch).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
INDEX="${1:-$REPO/index.html}"
[ -f "$INDEX" ] || { echo "index.html not found: $INDEX" >&2; exit 1; }
grep -q 'IS_MAC = ' "$HERE/wch_configurator.py" || { echo "wch_configurator.py has no macOS support: run python3 desktop/patch_macos.py first" >&2; exit 1; }
BUILD="$HERE/build/macos"
DIST="$HERE/dist"
mkdir -p "$BUILD" "$DIST"

if [ ! -x "$BUILD/venv/bin/python" ]; then
  echo "-> creating build venv"
  python3 -m venv "$BUILD/venv"
fi
PY="$BUILD/venv/bin/python"
"$PY" -m pip install --disable-pip-version-check -q --upgrade pip
# pywebview pulls pyobjc (Cocoa, WebKit, Quartz, Security) on macOS; pillow converts icon.ico to .icns
"$PY" -m pip install --disable-pip-version-check -q -r "$HERE/requirements-macos.txt" pyinstaller pillow

VERSION="$(sed -n 's/^APP_VERSION = "\(.*\)"/\1/p' "$HERE/wch_configurator.py")"
ARCH="${TARGET_ARCH:-$(uname -m)}"
cp "$INDEX" "$BUILD/index.html"
cp "$HERE/icon.ico" "$BUILD/icon.ico"
rm -rf "$DIST/WCH-Configurator.app"
ARCH_ARGS=()
[ -n "${TARGET_ARCH:-}" ] && ARCH_ARGS=(--target-arch "$TARGET_ARCH")
"$PY" -m PyInstaller --noconfirm --clean --windowed --onedir \
  --name WCH-Configurator \
  --osx-bundle-identifier io.github.zamanimahdi.wchconfigurator \
  --icon "$BUILD/icon.ico" \
  --distpath "$DIST" --workpath "$BUILD/work" --specpath "$BUILD" \
  --add-data "$BUILD/index.html:." --add-data "$BUILD/icon.ico:." \
  --collect-submodules webview \
  ${ARCH_ARGS[@]+"${ARCH_ARGS[@]}"} \
  "$HERE/wch_configurator.py"

APP="$DIST/WCH-Configurator.app"
PLIST="$APP/Contents/Info.plist"
# version, display name, dark mode, minimum macOS
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $VERSION" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string WCH Configurator" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSRequiresAquaSystemAppearance bool false" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSHumanReadableCopyright string WCH Configurator by Amir1387aht (Another)" "$PLIST" 2>/dev/null || true
# ad-hoc signature so Apple silicon starts the re-written bundle
codesign --force --deep --sign - "$APP"

ZIP="$DIST/WCH-Configurator-macos-$ARCH.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
echo
echo "OK -> $APP"
echo "   $ZIP ($(du -h "$ZIP" | cut -f1)), SHA256 $(shasum -a 256 "$ZIP" | cut -d' ' -f1)"
