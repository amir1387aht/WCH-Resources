#!/usr/bin/env bash
# Download and unpack the MounRiver Linux x64 toolchain (contains "RISC-V Embedded GCC12").
#
#   bash .github/ci/fetch_toolchain.sh <dest dir> [info|fetch]
#
#   info   prints "name=<tarball name>" for the cache key (writes it to $GITHUB_OUTPUT too)
#   fetch  downloads + unpacks into <dest dir> unless the GCC12 bin folder is already there,
#          then prints "bin=<folder with riscv-wch-elf-gcc>"
#
# Where the file comes from: mounriver.com/download -> Linux -> "Toolchain" table
# (MRS_Toolchain_Linux_X64_V<ver>.tar.xz, about 400 MB). The site has no stable direct
# link: file-oss.mounriver.com answers 403 without a signature, and the signed link
# (sign=..&time=..&from=<your IP>) is made per request by the site's public API:
#   GET https://api.mounriver.com/mountriver/api/version/fetchRecentOpenOcd?osType=LINUX&lang=en
#       -> result[0].fileName, result[0].softResId
#   GET https://api.mounriver.com/mountriver/api/version/getDownloadUrl?resourceId=<softResId>
#       -> result = signed URL
# This script uses that API. If it stops working, set MRS_TOOLCHAIN_URL (repository
# variable) to a mirror of the tarball, and MRS_TOOLCHAIN_NAME to its file name.
# The workflow caches the unpacked toolchain by file name, so the download happens
# only when MounRiver publishes a new version.
set -euo pipefail
[ -n "${RUNNER_DEBUG:-}${CI_TRACE:-}" ] && set -x
DEST="$1"; MODE="${2:-fetch}"
API="https://api.mounriver.com/mountriver/api/version"
UA="Mozilla/5.0 (X11; Linux x86_64) wch-configurator-ci"

json() { python3 -c 'import json,sys; d=json.load(sys.stdin); exec(sys.argv[1])' "$1"; }

name="${MRS_TOOLCHAIN_NAME:-}"; resid=""
if [ -z "${MRS_TOOLCHAIN_URL:-}" ]; then
  meta="$(curl -fsSL --retry 3 -A "$UA" -H "Referer: https://www.mounriver.com/" "$API/fetchRecentOpenOcd?osType=LINUX&lang=en")"
  name="$(json 'r=[x for x in d["result"] if x.get("systemBits","").upper()=="X64"] or d["result"]; print(r[0]["fileName"])' <<<"$meta")"
  resid="$(json 'r=[x for x in d["result"] if x.get("systemBits","").upper()=="X64"] or d["result"]; print(r[0]["softResId"])' <<<"$meta")"
fi
name="${name:-$(basename "${MRS_TOOLCHAIN_URL%%\?*}")}"

if [ "$MODE" = info ]; then
  echo "name=$name"; [ -n "${GITHUB_OUTPUT:-}" ] && echo "name=$name" >> "$GITHUB_OUTPUT"
  exit 0
fi

find_bin() { [ -d "$DEST" ] || return 0; find "$DEST" -type f -name riscv-wch-elf-gcc -path '*GCC12*' 2>/dev/null | head -1 || true; }
gcc="$(find_bin)"
if [ -z "$gcc" ]; then
  url="${MRS_TOOLCHAIN_URL:-}"
  if [ -z "$url" ]; then
    resp="$(curl -sSL --retry 3 -A "$UA" -H "Referer: https://www.mounriver.com/" "$API/getDownloadUrl?resourceId=$resid" || true)"
    url="$(json 'r=d.get("result"); print(r if isinstance(r, str) and r.startswith("http") else "")' <<<"$resp" 2>/dev/null || true)"
    if [ -z "$url" ]; then
      echo "::error::MounRiver did not return a download link for $name (resource $resid). Response: ${resp:0:300}"
      echo "Set the repository variables MRS_TOOLCHAIN_URL / MRS_TOOLCHAIN_NAME to a mirror of the toolchain tarball."
      exit 1
    fi
  fi
  echo "Downloading $name"
  mkdir -p "$DEST"
  curl -fL --retry 3 -A "$UA" -o "$RUNNER_TEMP/mrs-toolchain.tar.xz" "$url"
  tar -xJf "$RUNNER_TEMP/mrs-toolchain.tar.xz" -C "$DEST"
  rm -f "$RUNNER_TEMP/mrs-toolchain.tar.xz"
  gcc="$(find_bin)"
  [ -n "$gcc" ] || { echo "::error::riscv-wch-elf-gcc (GCC12) not found in $name"; find "$DEST" -maxdepth 3 -type d; exit 1; }
fi
bin="$(dirname "$gcc")"
"$gcc" --version | head -1
echo "bin=$bin"; [ -n "${GITHUB_OUTPUT:-}" ] && echo "bin=$bin" >> "$GITHUB_OUTPUT"
exit 0
