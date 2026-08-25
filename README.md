# Directus IIIF endpoint

[![CI](https://github.com/Digital-Livonia/directus-iiif-endpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/Digital-Livonia/directus-iiif-endpoint/actions/workflows/ci.yml)

Adds [IIIF Presentation API 3.0](https://iiif.io/api/presentation/3.0/) support to Directus media files.

## URL structure
- `example.org/iiif/manifest/:collection/:id` — returns the IIIF manifest for a collection item
- `example.org/iiif/search/:collection/:id?q=term` — [IIIF Content Search API v1](https://iiif.io/api/search/1.0/) over that item's OCR text (only meaningful once `/parse-ocr` has been run for it — see below)
- `POST example.org/iiif/parse-ocr` `{ "collection": "...", "id": "..." }` — parses that item's linked `annotation_files` (W3C/OA AnnotationList JSON, produced by an ALTO→annotation conversion step upstream of this extension) into rows in the `ocr_entries` collection, replacing any previous rows for that item. Run this once per item after (re-)uploading its annotation files, before its search will return anything.
  - In practice this is triggered via a **Directus Flow** (manual trigger, run from inside a collection item), not called directly. Configured today for the `magistraat` collection only, as a "Request URL" operation:
    - Method: `POST`
    - URL: the environment's own `PUBLIC_URL` + `/iiif/parse-ocr` (e.g. `https://dev.db.dl.tlu.ee/iiif/parse-ocr` on dev, `https://db.dl.tlu.ee/iiif/parse-ocr` on production) — **must be set per-environment when the flow is (re)created**, since the flow's request URL is stored as-is, not derived at run time. This is the same "absolute URL baked in per-environment" trap as `annotation_files`/`ocr_entries.canvas`/`.manifest` (see the known limitation above and the 1.0.9/1.0.10 changelog entries) — if a flow gets copied between environments (e.g. dev mirroring production's flows), this URL needs updating by hand, it won't fix itself.
    - Request body: `{"collection":"magistraat","id":{{$last.body.keys[0]}}}` — `{{$last.body.keys[0]}}` is Directus's own flow templating syntax for "the primary key of the item the flow was manually triggered from".
  - **TODO / known gap**: `POST /parse-ocr` has no token or auth check of its own — anyone who knows the URL can trigger it, relying entirely on whatever Directus role permissions happen to apply to the caller's `ocr_entries` access (currently blocks the public role, but that's incidental, not a deliberate access control on this route). Should require a shared secret/token before this is exposed more broadly.

## Requirements
- Environment variables:
  - `PUBLIC_URL` — base URL used to build manifest/canvas/asset ids, and the search service `@id` (derived, not separately configured — see below)
  - `IIIF_IMAGE_SERVER` — base URL of the IIIF Image API server (e.g. [iiif-convert-and-serve](https://github.com/Digital-Livonia/iiif-convert-and-serve)) that actually serves pixels; canvas `body.id`/`body.service` are built as `{IIIF_IMAGE_SERVER}{filename_disk}/full/max/0/default.webp` + an `ImageService3` service block. In practice this is one shared server across environments (same underlying file storage), so the same value is likely correct everywhere it's deployed — but it must still be set, or image URLs come out as `undefined/...`.
- The manifest's `service` block (IIIF Content Search v1, only present when the item has annotations) advertises `@id: {PUBLIC_URL}/iiif/search/{collection}/{fileId}` — same shape as the manifest's own `id`, just `/iiif/search/` instead of `/iiif/manifest/`. This route **is** implemented by this extension (`GET /search/:collection/:file_id`, above) — it searches whatever's been ingested into `ocr_entries` via `/parse-ocr`.
- The `ocr_entries` collection must exist (fields: `text`, `x`, `y`, `width`, `height`, `canvas`, `manifest`, `collection_name`, `collection_id`) — it's a fixed collection name, not something configured per-collection in `IIIF_settings`.
- Extension relies on an `IIIF_settings` table where collection configuration is defined. Required fields:
  - `iiif_collection` — collection name
  - `iiif_file` — relation field storing images
  - `iiif_canvas_label` — field used as manifest label
  - `iiif_meta` — array of Key-Value pairs for manifest metadata
  - `annotation_files` — related annotation files (JSON/W3C annotations)
  - `alto_files` — related ALTO XML files
  - `txt_files` — related plain text files
- `annotation_files`, `alto_files`, and `txt_files` are matched to an image by filename: the image's filename stem (everything before the last `.`) must equal the stem of the related file, e.g. `page001.jpg` ↔ `page001.json` / `page001.xml` / `page001.txt`. Unmatched files are silently skipped for that canvas.

> ⚠️ **Known limitation: annotation highlight boxes don't render on dev.** Clicking an annotation in Mirador shows the highlight box on production but not on dev, for the same item. Root cause (confirmed 2026-08-25): `annotation_files` JSON is Presentation API 2.0 (`on`/`within.@id`) and is produced by an upstream ALTO→annotation conversion step (outside this repo) that bakes in **absolute URLs pointing at production's domain** (`db.dl.tlu.ee`), e.g. `"on": "https://db.dl.tlu.ee/iiif/canvas/1#xywh=..."`. Since dev and production share the same file storage, dev serves the *exact same file* — but dev's own canvas ids are `dev.db.dl.tlu.ee/iiif/canvas/...`, a different origin. Mirador can't match the annotation's target to a canvas across origins, so it silently fails to draw the box (no console error). This isn't fixable in this extension: the manifest/canvas ids it generates are already correctly environment-specific (`PUBLIC_URL`-based) — the problem is purely in the *content* of the shared annotation files, which can only ever be correct for one environment's domain at a time. Fixing it properly means making the upstream ALTO→annotation conversion environment-agnostic (relative references) or environment-parameterized, or re-converting specific items against dev's domain when you need to test this on dev.

## Updating
- CI (`.github/workflows/ci.yml`) runs lint + tests on every push/PR to `master` — deployment itself stays manual, on purpose (no S3/kubeconfig credentials are stored in this repo)
- Directus runs on two instances, both in the `dl-tlu-ee` namespace; both need the same `dist/` folder, just delivered differently. In both cases, start with:
  ```bash
  npm run package
  ```
  (this runs `npm run build` internally and assembles `dist/` — no need to run `build` separately first)

### Production — `dl-directus-deployment`
- upload the contents of `dist/` to S3 storage via https://console.s3.hpc.ut.ee/ into the folder `extensions`
- delete the previous version of the folder there first
- restart: `kubectl rollout restart deployment/dl-directus-deployment -n dl-tlu-ee`

### Dev — `dev-dl-directus-deployment`
Dev Directus runs on the same cluster, so `dist/` is copied straight into the pod's `/directus/extensions/` instead of going through S3. On a T7/macOS checkout, strip the AppleDouble `._*` files `npm run package` may leave in `dist/` first, or they'll get copied into the pod too:
```bash
find dist -name '._*' -delete

POD=$(kubectl get pods -n dl-tlu-ee -l app=dev-dl-directus -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n dl-tlu-ee "$POD" -- rm -rf /directus/extensions/directus-iiif-endpoint
kubectl cp dist "$POD":/directus/extensions/directus-iiif-endpoint -n dl-tlu-ee
kubectl rollout restart deployment/dev-dl-directus-deployment -n dl-tlu-ee
kubectl rollout status deployment/dev-dl-directus-deployment -n dl-tlu-ee --timeout=90s
```
(pod label is `app=dev-dl-directus` — the deployment is `dev-dl-directus-deployment`, but its pod template uses the shorter label; confirmed against the live cluster 2026-08-25)

After the rollout finishes, check the **new** pod (name changes on restart) picked up the build cleanly — a stale `directus:extension.host` here vs. the actual running Directus version can make the extension fail to register silently:
```bash
NEW_POD=$(kubectl get pods -n dl-tlu-ee -l app=dev-dl-directus -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n dl-tlu-ee "$NEW_POD" --tail=30 | grep -i "extension\|error"
```
## Testing

```bash
npm test
```

See [TESTING.md](TESTING.md) for a full, human-readable catalogue of what every test checks.

Tests follow the **SAFe Test Automation Pyramid**:

| Layer | Scope | Location | When to run |
|---|---|---|---|
| **Unit** | Pure builder functions (`helpers.js`) | `src/helpers.test.js` | Every commit |
| **Integration** | Handler + mocked `ItemsService` | `src/handler.test.js` | Every commit |
| **API** | Live Directus instance | Manual / CI with env | Before deploy |
| **E2E** | IIIF viewer loads manifest (Mirador) | Manual | Before release |

### Test plan for new features

When adding new functionality, cover each relevant pyramid layer:

1. **Unit** — every new function in `helpers.js` needs tests for happy path, empty input, and edge cases. New canvas/manifest properties must have the correct IIIF v3 shape (`type`, `motivation`, locale structure).
2. **Conditional properties** — optional fields (`annotations`, `service`, `rendering`) must be **absent** when conditions are not met, not just present when they are.
3. **Annotation matching** — if changing filename-to-image matching logic, test both matched and unmatched cases.
4. **File sorting** — any new file relation array must be sorted alphabetically by `title` before use; add a sort-order test.
5. **Integration** — new `IIIF_settings` fields must be covered by an integration test that verifies the field is read and passed into the manifest.
6. **`IIIF_settings`** — document new fields in README.

There has been some discussion about the IIIF support for Directus: https://github.com/directus/directus/discussions/15495

## Versions
### 1.0.10
- Fixed `POST /parse-ocr`'s "delete existing entries for this item" lookup: it filtered `collection_id: {_eq: Number(id)}`, but entries are created with `collection_id: String(id)` — a type mismatch that (against a text-typed column) silently matched nothing, so re-running `/parse-ocr` for the same item never actually cleared the old rows; it just accumulated a duplicate set alongside them. This is also present in production's own code (carried over faithfully when 1.0.8 recovered it) — production just never surfaced it as visibly broken, since old and new rows there share the same (correct) domain. Found by re-running `/parse-ocr` on dev after 1.0.9 and seeing search results still link to production despite `ocr_entries.canvas`/`.manifest` supposedly being rewritten on ingest.
### 1.0.9
- `POST /parse-ocr` now rewrites each entry's `canvas`/`manifest` URL to this environment's `PUBLIC_URL` before storing it in `ocr_entries`, instead of keeping whatever origin was baked into the source `annotation_files` JSON at conversion time. Same root cause as the [annotation-highlight known limitation](#requirements) above: the annotation files are shared across environments, so running `/parse-ocr` on dev with files converted against production previously produced search results whose links (`resources[].on`, `resources[].within`) pointed back at production instead of dev.
### 1.0.8
- Added `POST /parse-ocr` and `GET /search/:collection/:file_id` — real IIIF Content Search, backed by a new `ocr_entries` collection. Also switched canvas image bodies to the real IIIF Image API (`IIIF_IMAGE_SERVER` + `ImageService3`, using `filename_disk`) instead of a flat Directus asset URL.
- **Backstory**: production had been running this functionality since some point after 1.0.5, but the `build/index.js` it was deployed from was hand-edited directly and re-uploaded to S3 — never committed back to `src/`. Recovered on 2026-08-25 by downloading production's actual deployed build from the `dl-tlu-ee` S3/MinIO bucket and de-minifying it; reverse-engineered into proper source, with tests, here. `git log` for this repo has no trace of it before this commit — worth remembering if production's behavior ever again doesn't match what's in `master`.
### 1.0.7
- Fixed IIIF Content Search `service.@id`: 1.0.6 introduced an `IIIF_SEARCH_URL` env var that was never set on any real deployment, producing `"@id": undefined` in manifests (confirmed live on dev — Mirador's search request ended up requesting a broken `.../undefined?q=...` URL). Compared against production's manifest output directly: the correct `@id` is `{PUBLIC_URL}/iiif/search/{collection}/{fileId}`, mirroring the manifest's own `id` shape. Derived from `PUBLIC_URL` like everything else now; `IIIF_SEARCH_URL` is gone.
- Metadata rows with a `null` value (e.g. an `IIIF_settings`-configured field that's empty on a given item) are now omitted from the manifest entirely, instead of showing up as a literal `"null"`.
### 1.0.6
- Canvas `seeAlso` entries for matched ALTO XML and plain-text files (`alto_files`/`txt_files` were read but never surfaced in the manifest before this)
### 1.0.5
- IIIF content search support for items with annotations
### 1.0.4
- Image Download link added via `rendering` property
### 1.0.3
- Annotations support
### 1.0.2
- Thumbnail url and size update
### 1.0.1
- Support for asset author

