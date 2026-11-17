#!/usr/bin/env bash
# Sparse-clone the official WCH EVT packages listed under "evt" in the test matrix.
#
#   bash .github/ci/fetch_evt.sh <test-matrix.json> <evt root>
#
# Result: <evt root>/<repo>/EVT/EXAM/SRC (+ EXAM/BLE/HAL, LIB for the BLE chips),
# the same layout the exported project's "WCH: Setup" task creates.
set -euo pipefail
MATRIX="$1"; ROOT="$2"
mkdir -p "$ROOT"
python3 - "$MATRIX" <<'EOF' | tr -d '\r' > "$ROOT/.list"
import json, sys
for repo, paths in json.load(open(sys.argv[1]))["evt"].items():
    print(repo, " ".join(paths))
EOF
while read -r repo paths; do
  dest="$ROOT/$repo"
  if [ -d "$dest/.git" ]; then
    echo "== $repo (cached, updating)"
    git -C "$dest" fetch --quiet --depth 1 origin HEAD && git -C "$dest" reset --quiet --hard FETCH_HEAD || echo "   update failed, using the cached copy"
  else
    echo "== $repo"
    for i in 1 2 3; do
      rm -rf "$dest"
      git clone --quiet --depth 1 --filter=blob:none --sparse "https://github.com/openwch/$repo.git" "$dest" && break
      echo "   clone failed (try $i), retrying"; sleep 10
    done
  fi
  # shellcheck disable=SC2086
  git -C "$dest" sparse-checkout set $paths
  [ -d "$dest/EVT/EXAM/SRC" ] || { echo "::error::$repo: EVT/EXAM/SRC missing after checkout"; exit 1; }
  echo "   $(git -C "$dest" log -1 --format='%h %cs') $(du -sh "$dest/EVT" | cut -f1)"
done < "$ROOT/.list"
