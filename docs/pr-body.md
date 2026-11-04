# I am submitting a new Community Plugin

## Repo URL

https://github.com/moyanmoyu/obsidian-life-map

## Release Checklist

- [x] I have tested this on macOS
- [x] I have tested this on iOS (iPhone, Obsidian mobile)
- [x] I have tested this on Android (Huawei, Obsidian mobile)
- [ ] I have tested this on Windows / Linux
- [x] The GitHub release contains `manifest.json`, `main.js`, and `styles.css`
- [x] The GitHub release name matches the release tag (`v0.9.4`)
- [x] The `manifest.json` version matches the release tag (`0.9.4`)
- [x] The README describes the plugin and how to use it
- [x] The README includes screenshots
- [x] I have disclosed any network usage (see below)
- [x] The plugin does not require payment
- [x] The plugin does not require an account
- [x] The plugin contains no client-side telemetry
- [x] The plugin does not implement its own updater

## What the plugin does

**Life Map** is a general-purpose map view for Obsidian. It plots places from four kinds of sources on one map:

- note frontmatter (`coordinates` + optional `coord_sys`)
- `.geojson` files in the vault
- `.csv` files with latitude/longitude columns
- any JSON API, mapped declaratively with JSONPath (no scripting)

Notes at the same coordinate are aggregated into a single marker; each note becomes a visit sub-record inside the popup, so a place visited three times is one marker with three entries.

Other features: clustering, a sidebar with place list / photo wall / timeline, an inline map via a `life-map` code block, photo lightbox, and export of the current filtered view to GeoJSON or a Markdown table.

## Network usage

All network access is either user-configured or optional:

- **Basemap tiles** — Tianditu (`t0`–`t7.tianditu.gov.cn`, user's own `tk`), OpenFreeMap (`tiles.openfreemap.org`, keyless fallback), or custom XYZ tiles the user configures
- **HTTP data sources** — only endpoints the user configures themselves

No telemetry, no analytics, no remote code loading, no auto-updater. If no basemap key is configured the plugin falls back to a keyless basemap and shows an in-app hint.

## Notes for reviewers

- Credentials entered by the user (Tianditu `tk`, HTTP tokens) are stored locally in `.obsidian/plugins/life-map/data.json`; the plugin never uploads them.
- The plugin ships no map data. Basemap copyright belongs to the respective providers.
- Deletion only works on vault Markdown notes, always requires a confirmation dialog, and goes through Obsidian's trash (`fileManager.trashFile`).
