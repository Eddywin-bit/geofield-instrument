#!/usr/bin/env bash
# Regenerates public offline basemap ghana.pmtiles from the Protomaps
# daily planet build (OpenStreetMap data, ODbL).
# Output: ghana.pmtiles — Ghana bbox, maxzoom 14, ~92 MB.
# Known-good build 20260708 produced md5 ab08c5fba7f2992419b690cd2ec34663 (92038624 bytes).
# Newer builds produce newer data (hash will differ, that is expected).
set -euo pipefail
BUILD="${1:-20260708}"
BBOX="-3.26,4.74,1.19,11.18"
if ! command -v pmtiles >/dev/null; then
  echo "Install the pmtiles CLI: https://github.com/protomaps/go-pmtiles/releases" >&2
  exit 1
fi
pmtiles extract "https://build.protomaps.com/${BUILD}.pmtiles" ghana.pmtiles --bbox="$BBOX" --maxzoom=14
md5sum ghana.pmtiles
