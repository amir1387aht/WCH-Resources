#!/usr/bin/env bash
# Build every exported project under <out dir> and check that src/ compiles cleanly.
#
#   bash .github/ci/build_all.sh <out dir> <evt root> <toolchain bin dir>
#
#   <out dir>       folder with one exported project per subfolder (.github/ci/export_projects.mjs)
#   <evt root>      folder with the sparse EVT clones: <evt root>/<repo>/EVT/EXAM/SRC
#   <toolchain bin> folder with riscv-wch-elf-gcc (MounRiver "RISC-V Embedded GCC12/bin")
#
# A project fails when CMake or the build fails, or when the compiler prints any
# warning or error for a file in src/ (the generated code). Warnings inside the
# EVT drivers are WCH's code and are only counted. Writes <out dir>/build-summary.md
# and exits 1 if any project failed.
set -u
OUT="$(cd "$1" && pwd)"; EVTROOT="$2"; TC="$3"
GEN="${CMAKE_GENERATOR:-Ninja}"
SUM="$OUT/build-summary.md"
printf '| project | result | src diag | EVT warnings | FLASH | RAM |\n|---|---|---|---|---|---|\n' > "$SUM"
fail=0; n=0
pj() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2]) or "")' "$1" "$2" 2>/dev/null || python -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2]) or "")' "$1" "$2"; }
for d in "$OUT"/*/; do
  d="${d%/}"; [ -f "$d/wch-project.json" ] || continue
  name="$(basename "$d")"; n=$((n + 1))
  repo="$(pj "$d/wch-project.json" evtRepo)"
  evt="$EVTROOT/$repo/EVT"
  rm -rf "$d/build"
  res=OK
  if ! cmake -S "$d" -B "$d/build" -G "$GEN" -DWCH_EVT_DIR="$evt" -DWCH_TOOLCHAIN_BIN="$TC" > "$d/cmake.log" 2>&1; then
    res="CMAKE FAIL"; srcd=-; evtw=-; flash=-; ram=-
    tail -15 "$d/cmake.log"
  else
    cmake --build "$d/build" > "$d/build.log" 2>&1 || res="BUILD FAIL"
    # diagnostics in the generated sources: src/<file>.c|h:<line>:<col>: warning|error
    srcd=$(grep -cE '(^|[/\\])src[/\\][A-Za-z_0-9]+\.[ch]:[0-9]+:[0-9]+: (warning|error)' "$d/build.log")
    evtw=$(grep -E ': warning:' "$d/build.log" | grep -vcE '(^|[/\\])src[/\\][A-Za-z_0-9]+\.[ch]:')
    flash=$(awk '$1=="FLASH:"{print $2" "$3" ("$NF")"}' "$d/build.log" | tail -1)
    ram=$(awk '$1=="RAM:"{print $2" "$3" ("$NF")"}' "$d/build.log" | tail -1)
    [ "$res" = OK ] && [ "$srcd" != 0 ] && res="SRC WARNINGS"
    [ -f "$d/build/$(pj "$d/wch-project.json" name).hex" ] || { [ "$res" = OK ] && res="NO HEX"; }
  fi
  [ "$res" = OK ] || fail=$((fail + 1))
  printf '| %s | %s | %s | %s | %s | %s |\n' "$name" "$res" "$srcd" "$evtw" "${flash:--}" "${ram:--}" >> "$SUM"
  echo "$name: $res (src diag $srcd, EVT warnings $evtw) FLASH $flash RAM $ram"
  if [ "$res" != OK ] && [ -f "$d/build.log" ]; then
    grep -E '(^|[/\\])src[/\\].*: (warning|error)|error:|undefined reference|overflowed' "$d/build.log" | head -20 | sed 's/^/    /'
    [ -n "${GITHUB_ACTIONS:-}" ] && grep -E '(^|[/\\])src[/\\][A-Za-z_0-9]+\.[ch]:[0-9]+:[0-9]+: (warning|error)' "$d/build.log" | head -20 |
      sed -E "s#^.*src[/\\\\]([A-Za-z_0-9]+\.[ch]):([0-9]+):([0-9]+): (warning|error): (.*)#::error title=$name::src/\1:\2:\3 \4: \5#"
  fi
done
echo; cat "$SUM"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$SUM" >> "$GITHUB_STEP_SUMMARY"
echo; echo "$((n - fail))/$n projects built without errors or src/ warnings"
[ $n -gt 0 ] && [ $fail = 0 ]
