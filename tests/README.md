# Tests

Unit test suite for NYC Health Ratings, written with [Jest](https://jestjs.io/).

## Running tests

```bash
npm test
```

Tests run automatically on every push and pull request via the **Tests** GitHub Actions workflow (`.github/workflows/test.yml`). The workflow must pass before a PR can be merged.

---

## Test files

### `header.test.js` — Header presence regression guard

Parses `index.html` with jsdom and asserts the map header (and its essential controls) can never silently disappear — particularly on mobile, where a stray `display: none` inside a media query has been a real regression risk.

#### Structure assertions

| Test | What it checks |
|------|----------------|
| `<header>` exists | The header element is present in the document |
| Contains `#grades-btn` | Grades dropdown trigger lives inside the header |
| Contains `#violations-btn` | Violations dropdown trigger lives inside the header |
| Contains `#changes-btn` | Stats / Grade Changes button lives inside the header |
| Contains `#search-input` | Restaurant search input lives inside the header |
| `#search-wrap` wraps `#search-input` | Search markup retains the structure the mobile flex rules rely on |

#### CSS audit

A brace-balanced parser walks every CSS rule in every `<style>` block (including rules nested inside `@media` queries) and asserts no rule targeting `header`, `#search-wrap`, or any required button ID sets `display: none`, `visibility: hidden`, or `opacity: 0` — at any viewport width.

| Test | What it checks |
|------|----------------|
| Parser sanity | A non-trivial number of rules were parsed (catches a broken parser that would make the audit pass vacuously) |
| `header` is never hidden | No rule, in any media query, hides the header element |
| `#search-wrap` is never hidden | Same, for the search wrapper |
| `#grades-btn` / `#violations-btn` / `#changes-btn` / `#search-input` are never hidden | Same, for each essential control |

---

### `geo.test.js` — Geolocation polygon utilities

Tests the ray-casting functions in `scripts/geo.js` that determine whether a coordinate falls inside an NYC borough polygon.

#### `pointInRing`

The core ray-casting algorithm. Accepts a `[lng, lat]` GeoJSON ring and a point.

| Test | What it checks |
|------|----------------|
| Point clearly inside | A coordinate well within the ring returns `true` |
| Point outside (left) | A coordinate west of the ring returns `false` |
| Point outside (above) | A coordinate north of the ring returns `false` |
| Point outside (below) | A coordinate south of the ring returns `false` |

#### `pointInFeature`

Wraps `pointInRing` to handle GeoJSON `Feature` objects with `Polygon` or `MultiPolygon` geometry.

| Test | What it checks |
|------|----------------|
| Inside a Polygon | A point inside the feature's outer ring returns `true` |
| Outside a Polygon | A point outside returns `false` |
| Inside first polygon of a MultiPolygon | Returns `true` |
| Inside second polygon of a MultiPolygon | Returns `true` (all polygons are checked) |
| Outside all polygons of a MultiPolygon | Returns `false` |

#### `isInNYC`

Top-level function that checks a `[lat, lng]` coordinate against an array of GeoJSON features (the loaded NYC borough boundaries).

| Test | What it checks |
|------|----------------|
| Times Square (Manhattan) | Correctly identified as inside NYC |
| Midtown Manhattan | Correctly identified as inside NYC |
| Newark, NJ | Correctly identified as outside NYC |
| Hoboken, NJ | Correctly identified as outside NYC |
| Empty features array | Returns `false` without crashing |
| `null` features | Returns `false` — handles the state before GeoJSON has loaded |

---

### `utils.test.js` — UI utilities and location resolution

Tests the functions in `scripts/utils.js` that cover grade colours, date formatting, and all map-view decision logic.

#### `gradeColor`

Maps a health grade letter to its hex colour used by map markers and popups.

| Test | What it checks |
|------|----------------|
| Grade A | Returns `#22c55e` (green) |
| Grade B | Returns `#eab308` (yellow) |
| Grade C | Returns `#ef4444` (red) |
| Grade P | Returns `#a855f7` (purple) |
| Grade Z | Returns `#f97316` (orange) |
| Grade N | Returns `#6b7280` (grey) |
| Unknown grade | Falls back to the N colour (`#6b7280`) |

#### `formatDate`

Formats an ISO date string for display in restaurant popups.

| Test | What it checks |
|------|----------------|
| Valid ISO string | Formats to a human-readable string containing the month name and year |
| `null` | Returns an em-dash (`—`) |
| `undefined` | Returns an em-dash (`—`) |
| Empty string | Returns an em-dash (`—`) |

#### `resolveMapView` — manual locate button

Determines the map view when the user manually clicks the ◎ locate button. Always produces an actionable destination.

| Test | What it checks |
|------|----------------|
| User inside NYC | Returns the user's coordinates at zoom 18 |
| User outside NYC (NJ) | Returns Union Square (`40.7359, -73.9911`) at zoom 14 |
| User far outside NYC (London) | Returns Union Square at zoom 14 |
| Features not yet loaded | Returns Union Square at zoom 14 (safe fallback) |

#### `resolveAutoLocate` — page-load race condition (geolocation fires first)

On page load, two async operations run concurrently: fetching the NYC borough GeoJSON and calling `getCurrentPosition`. If the browser has a cached GPS fix, geolocation can resolve in milliseconds — before the GeoJSON arrives. Without handling this, `isInNYC` sees `null` features and returns `false`, leaving NYC users stuck on Union Square.

`resolveAutoLocate` is called when geolocation resolves on page load. It returns:
- `'pending'` — GeoJSON not ready yet; caller should store the position
- `{ lat, lng, zoom: 18 }` — GeoJSON loaded and user is in NYC; apply this view
- `null` — GeoJSON loaded and user is outside NYC; do nothing (stay on Union Square)

| Test | What it checks |
|------|----------------|
| GeoJSON not loaded, user in NYC | Returns `'pending'` so the position is parked for later |
| GeoJSON not loaded, user outside NYC | Returns `'pending'` (NYC check deferred until features load) |
| GeoJSON loaded, user in NYC | Returns zoom-18 view immediately |
| GeoJSON loaded, user outside NYC | Returns `null` — map stays on Union Square silently |

#### `applyPendingAutoLocate` — resolves a stored position once GeoJSON loads

Called by `loadNYCBoroughBounds` after features have been set, to action any geolocation position that was parked while the GeoJSON was in flight.

| Test | What it checks |
|------|----------------|
| Pending position inside NYC | Returns zoom-18 view — map centres on the user |
| Pending position outside NYC | Returns `null` — map stays on Union Square |
| No pending position | Returns `null` — nothing to do |
| GeoJSON failed to load | Returns `null` — any pending position is discarded, map stays on Union Square |
