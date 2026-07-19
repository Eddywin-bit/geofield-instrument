GeoField
Offline-first Android field-geology companion for KNUST geology students in Ghana. Capacitor 7 + React/TypeScript (Vite). Three core jobs: GPS-based geological unit identification, geology knowledge access, and fast structured field notes (photos, voice, text).

* Package: `com.eondesigns.geofield`
* Repo: `Eddywin-bit/geofield-instrument` (private)
* Distribution: self-hosted APK via GitHub Releases. Not the Play Store.
* Current version: 0.6.4

Build and release flow
Do not push to `main` directly. Work on a feature branch and open a PR.

1. Make changes on a branch.
2. Open a PR. The human reviews the full diff before merging. This review is the diff audit.
3. Merge to `main`. GitHub Actions builds and signs the APK (4096-bit RSA keystore, valid to 2053) and publishes to GitHub Releases.

Signing secrets live in the repo: `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`geofield`), `KEY_PASSWORD`. Never print, log, or modify these.
`routeTree.gen.ts` regenerates on almost every build. That is expected and not a real change.
Locked files (do not modify unless the current task explicitly says to)
These are the engine and data contracts. Changing them risks silent breakage of the core identification and logging flow.

* `src/lib/geo-acquire.ts` (GPS fix acquisition, accuracy tiers)
* `findUnitAt` and `loadGeology` in `src/lib/geology.ts`
* The geology data sources `geology.geojson` and `units.json` loaded by `geology.ts`
* `src/lib/unit-colors.ts` (only intentional palette expansions allowed)
* Photo, voice, and service-worker pipelines
* `LogEntry` and `GeoUnit` data shapes and all shared type definitions

If a task seems to require touching a locked file, stop and report instead of editing.
Locked data shapes
`GeoUnit`: `{ unit_name, also_known_as, expected_rocks[], expected_features[], engineering_note, mineral_note }`
`LogEntry`: `{ id, timestamp, unit, belt, lat, lng, accuracy, note, photo?, hasVoice? }` with `lat`, `lng`, `accuracy` nullable, plus an additive `GF-YYYYMMDD-NNNN` reference field (old logs fall back to `id`).
Content source of truth
All geological unit content comes from the Gemini deep-research report, which is the single authoritative source. Do not invent, infer, or fill unit content from any other source. Apply the report completely across every field.
Permanently ruled out

* Photo or camera-based rock identification. Outcrop spread, hardness, acid reaction, grain texture, and fresh-versus-weathered surface cannot be read from a phone photo. Do not propose or build this.
* Manual export (JSON, ZIP, PDF) as the backup mechanism. Rejected as too technical for the target users.
* Static-averaging "high-precision" GPS mode. Field-tested and removed. Best-fix convergence beats averaging on correlated real-world data.

Storage and data safety
Capacitor durable native storage. Data must persist until the user chooses to delete it. Android uninstall wipes the sandbox, and Auto Backup (~25MB cap) cannot hold real photo and audio volume, so cloud backup and sync is the planned restore-on-reinstall mechanism, not a nice-to-have. Local persistence alone cannot deliver restore after a lost or reset phone.
Basemap and map

* ~5.5MB bundled GeoJSON in `public/data` (Ghana geology units, regions, rivers, roads, places, world-land fallback), served locally for offline use.
* 92MB Ghana PMTiles hosted on GitHub Pages (`eddywin-bit.github.io/geofield-assets/ghana.pmtiles`), downloaded at runtime in ranged chunks with resume, written to `@capacitor/filesystem` `Directory.Data` so it survives Clear Cache.
* Online tiles: OpenFreeMap Bright vector.
* Rendering: MapLibre GL JS v5. Map lives in `src/components/MapView.tsx`.

Conventions

* No em-dashes in user-facing copy, PDF output, or commit messages.
* Prefer single-file diffs. Name exact variables, patterns, class names, and lucide icon names.
* Clean up dead code (unused imports and constants) in the same change.
