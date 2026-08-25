# Directus IIIF endpoint

[![CI](https://github.com/Digital-Livonia/directus-iiif-endpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/Digital-Livonia/directus-iiif-endpoint/actions/workflows/ci.yml)

Adds [IIIF Presentation API 3.0](https://iiif.io/api/presentation/3.0/) support to Directus media files.

## URL structure
- `example.org/iiif/manifest/:collection/:id` — returns the IIIF manifest for a collection item

## Requirements
- Environment variables:
  - `PUBLIC_URL` — base URL used to build manifest/canvas/asset ids
  - `IIIF_SEARCH_URL` — `@id` of the IIIF Content Search service advertised in manifests that have annotations
- Extension relies on an `IIIF_settings` table where collection configuration is defined. Required fields:
  - `iiif_collection` — collection name
  - `iiif_file` — relation field storing images
  - `iiif_canvas_label` — field used as manifest label
  - `iiif_meta` — array of Key-Value pairs for manifest metadata
  - `annotation_files` — related annotation files (JSON/W3C annotations)
  - `alto_files` — related ALTO XML files
  - `txt_files` — related plain text files
- `annotation_files`, `alto_files`, and `txt_files` are matched to an image by filename: the image's filename stem (everything before the last `.`) must equal the stem of the related file, e.g. `page001.jpg` ↔ `page001.json` / `page001.xml` / `page001.txt`. Unmatched files are silently skipped for that canvas.
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
### 1.0.6
- Canvas `seeAlso` entries for matched ALTO XML and plain-text files (`alto_files`/`txt_files` were read but never surfaced in the manifest before this)
- **Deploy note**: IIIF Content Search `service.@id` is no longer hardcoded — it now comes from the `IIIF_SEARCH_URL` env var. **Set this in the deployment environment before rolling out 1.0.6**, or the `service` block on manifests with annotations will have `"@id": undefined`.
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

