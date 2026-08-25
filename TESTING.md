# Test documentation

A human-readable catalogue of every automated test in this repo — what it asserts and why. For how to run tests, see [README.md § Testing](README.md#testing). This file mirrors the test suite; if you add or rename a test, update the matching entry here too.

Current totals: **49 tests** across 2 files (`npm test`).

---

## Unit layer — `src/helpers.test.js` (40 tests)

Tests the pure builder functions in `src/helpers.js` directly, with no Directus involved — fake image/annotation/ALTO/text objects go in, IIIF JSON comes out.

### `findIdByFile` — filename → id lookup used by every matching feature
- Returns the id when a `filename_download` matches
- Returns `false` when nothing matches
- Returns `false` for an empty list

### `getAnnotations` — builds the `AnnotationPage` link for a matched `.json` annotation file
- Returns an `AnnotationPage` object with the correct asset URL when a match is found
- Returns `null` when no annotation matches

### `createItemArray` — canvas structure
- One canvas is produced per image
- Canvas `type` is `"Canvas"`
- Canvas `id` is 1-indexed (`.../canvas/1`, `.../canvas/2`, …)
- Canvas `label` uses the `none` locale (unlabelled, sequential number)
- Canvas carries the image's `width`/`height` through unchanged
- Thumbnail `height` is proportionally rounded from `width`/`height`

### `createItemArray` — painting annotation (the actual image content)
- Motivation is `"painting"`
- Body `format` is `image/jpeg`
- Body `id` uses the asset endpoint with `?format=jpg`
- Annotation `target` points back to its own canvas id

### `createItemArray` — rendering (image download link)
- `rendering[0].id` is a download link carrying the original filename
- `rendering[0].label` shows the uppercased file extension (e.g. "Download original (TIF)")

### `createItemArray` — annotation linking
- Canvas includes `annotations` when a `.json` file's stem matches the image's stem
- Canvas **omits** the `annotations` property entirely when there's no match (not `null` — absent)
- Matched annotation URL is `{assetBase}{id}.json`

### `getAltoSeeAlso` — builds a `seeAlso` Dataset entry for a matched ALTO XML file
- Returns a `Dataset` entry (with ALTO namespace `profile`, `format: text/xml`) when matched
- Returns `null` when no ALTO file matches

### `getTextSeeAlso` — builds a `seeAlso` Dataset entry for a matched plain-text file
- Returns a `Dataset` entry (`format: text/plain`) when matched
- Returns `null` when no text file matches

### `createItemArray` — ALTO/text `seeAlso` linking
- Canvas includes both entries (ALTO + text) when both match, in that order
- Canvas includes only the matched type when just one of ALTO/text is present
- `seeAlso` property is **absent** (not an empty array) when no ALTO/text files are configured at all
- `seeAlso` property is **absent** when ALTO/text arrays exist but no filename matches this image

### `createItemArray` — multiple images
- Canvases are numbered sequentially from 1 across multiple images

### `createIiifCollectionJson` — the manifest builder
- `@context` is the IIIF Presentation API v3 context URL
- `type` is `"Manifest"`
- `id` is built from `directusEndpoint` + `collection` + `fileId`
- `label` uses the `et` locale
- `iiifMeta` key/value pairs are mapped into `metadata` under the `et` locale
- `service` block is **absent** when `hasAnnotations` is `false`
- `service` block is present when `hasAnnotations` is `true`
- `service["@id"]` mirrors the manifest `id` shape, with `/search/` instead of `/manifest/` (not a separate configured URL — see [README § Requirements](README.md#requirements))
- Multiple metadata pairs all appear, in order
- A metadata row whose value is `null` is omitted entirely (not rendered as the string `"null"`)
- A metadata row whose value is `undefined` is likewise omitted

---

## Integration layer — `src/handler.test.js` (9 tests)

Tests the actual Directus route handler in `src/index.js`, with `ItemsService` mocked (no real Directus instance). Verifies the full flow: read `IIIF_settings` → read the collection item → read each related file → build the manifest — i.e. that the pieces are wired together correctly, not just that each piece works in isolation.

- Route `/manifest/:collection/:file_id` is registered on the router
- A full manifest (`type`, `id`, `label`, `items`) is built correctly from settings + collection + file data
- `ItemsService` is constructed once per collection (`IIIF_settings`, the target collection, `directus_files`) with the request's `schema`/`accountability` forwarded to each
- The `IIIF_settings` lookup is filtered by the requested `collection` (`iiif_collection: { _eq: … }`)
- Every configured `iiif_meta` field (not just one) is read from the collection item and mapped into manifest `metadata`
- A metadata row is omitted entirely when its underlying field value is `null`
- Annotations and the search `service` block appear when a file's name matches an annotation
- Annotations and the `service` block are absent when `annotation_files` isn't configured on the collection item
- `seeAlso` entries for both ALTO and text appear on the canvas when `alto_files`/`txt_files` are configured and filenames match

---

## Coverage gaps (known, not yet tested)

- **API layer** (live Directus instance) and **E2E layer** (viewer loads the manifest, e.g. Mirador) are manual-only per the README's test pyramid — no automated coverage exists or is currently planned for these.
- Error paths are not covered: e.g. what happens when `IIIF_settings` has no row for the requested collection (`fieldSettings[0]` would be `undefined`), or when `ItemsService.readOne`/`readByQuery` rejects. The handler has no `try/catch` around its async body and never calls `next(error)`, so today these would surface as unhandled rejections rather than a clean HTTP error response — worth fixing and covering with a test if this becomes a real-world issue (e.g. a collection is renamed without updating `IIIF_settings`).
