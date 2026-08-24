# Directus IIIF endpoint

Adds [IIIF Presentation API 3.0](https://iiif.io/api/presentation/3.0/) support to Directus media files.

## URL structure
- `example.org/iiif/manifest/:collection/:id` — returns the IIIF manifest for a collection item

## Requirements
- Extension relies on an `IIIF_settings` table where collection configuration is defined. Required fields:
  - `iiif_collection` — collection name
  - `iiif_file` — relation field storing images
  - `iiif_canvas_label` — field used as manifest label
  - `iiif_meta` — array of Key-Value pairs for manifest metadata
  - `annotation_files` — related annotation files (JSON/W3C annotations)
  - `alto_files` — related ALTO XML files
  - `txt_files` — related plain text files
## Updating
- There is no automatic deployment set up
- To update the code
  - build it locally `npm run build`
  - run `package` script so that `dist` folder is created
  - upload the content of `dist` folder to S3 storage via https://console.s3.hpc.ut.ee/ into the folder `extensions`
  - delete previous version of the folder
  - restart directus instance `kubectl rollout restart deployment/dl-directus-deployment -n dl-tlu-ee`
## Testing

```bash
npm test
```

Tests follow the **SAFe Test Automation Pyramid**:

| Layer | Scope | Location | When to run |
|---|---|---|---|
| **Unit** | Pure builder functions (`helpers.js`) | `src/helpers.test.js` | Every commit |
| **Integration** | Handler + mocked `ItemsService` | `src/handler.test.js` *(planned)* | Every commit |
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

