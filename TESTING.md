# Test documentation

A human-readable catalogue of every automated test in this repo — what it asserts and why. For how to run tests, see [README.md § Testing](README.md#testing). This file mirrors the test suite; if you add or rename a test, update the matching entry here too.

Current totals: **84 tests** across 2 files (`npm test`).

---

## Unit layer — `src/helpers.test.js` (60 tests)

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

### `createItemArray` — painting annotation (IIIF Image API)
- Motivation is `"painting"`
- Body `format` is `image/jpeg`
- Body `id` requests the image through the IIIF Image API (`{IIIF_IMAGE_SERVER}{filename_disk}/full/max/0/default.webp`) — not a flat Directus asset URL
- Body carries an `ImageService3` service block pointing at `{IIIF_IMAGE_SERVER}{filename_disk}`, `profile: "level1"`
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

### `extractOcrEntriesFromAnnotationPage` — turns a fetched annotation-list JSON into `ocr_entries` rows
- Extracts text + region from a `resources` (IIIF v2 `AnnotationList`) shape
- Extracts text + region from an `items`/`target`/`body.value` (IIIF v3) shape
- Falls back to an `annotations` array when neither `resources` nor `items` is present
- Carries the source manifest id through from `within["@id"]`
- Skips entries with no usable text (`resource.chars` / `body.value` missing)
- Skips entries with no region (`on`/`target` missing)
- Skips entries whose `#xywh=` coordinates don't parse to four numbers
- Returns an empty array when there are no resources at all
- **Origin rewriting** (annotation files are shared across environments and carry whatever domain they were converted against): with no `directusEndpoint` given, `canvas`/`manifest` are left untouched (back-compat); given a `directusEndpoint`, both are rewritten to that origin while keeping their path; a non-URL `canvas` value (fails to parse as a URL) is left untouched rather than throwing

### `buildIiifSearchResponse` — builds the IIIF Content Search API v1 response from `ocr_entries` rows
- `@context` is the IIIF Search API v1 context URL
- `@id` echoes the request URL verbatim
- `within.total` matches the number of entries
- Each resource is an `oa:Annotation` with `cnt:ContentAsText` matching the entry's text
- Resource `on` is built from `canvas` + `#xywh=x,y,width,height`
- Resource `@id` is namespaced under `{directusEndpoint}/iiif/annotation/{entryId}`
- Each hit references its resource's `@id` and carries the matched text

---

## Integration layer — `src/handler.test.js` (24 tests)

Tests the actual Directus route handler in `src/index.js`, with `ItemsService` mocked (no real Directus instance). Verifies the full flow: read `IIIF_settings` → read the collection item → read each related file → build the manifest — i.e. that the pieces are wired together correctly, not just that each piece works in isolation.

- Route `/manifest/:collection/:file_id` is registered on the router
- A full manifest (`type`, `id`, `label`, `items`) is built correctly from settings + collection + file data
- `ItemsService` is constructed once per collection (`IIIF_settings`, the target collection, `directus_files`) with the request's `schema`/`accountability` forwarded to each
- The `IIIF_settings` lookup is filtered by the requested `collection` (`iiif_collection: { _eq: … }`)
- Every configured `iiif_meta` field (not just one) is read from the collection item and mapped into manifest `metadata`
- A metadata row is omitted entirely when its underlying field value is `null`
- Annotations and the search `service` block appear when a file's name matches an annotation
- Annotations and the `service` block are absent when `annotation_files` isn't configured on the collection item
- The canvas image body is built via the IIIF Image API using `filename_disk` (not `filename_download`), with the `ImageService3` service block
- `seeAlso` entries for both ALTO and text appear on the canvas when `alto_files`/`txt_files` are configured and filenames match

### `POST /parse-ocr`
- Route is registered on the router
- Responds `400` when `collection` or `id` is missing from the request body
- Falls back to `"annotations"` as the field name when `IIIF_settings` has no row for the collection (mirrors the manifest route's own defaulting)
- Responds `404` when the collection item has no files in its annotation field
- Fetches each linked annotation asset (via `GET {origin}/assets/{id}`) and ingests the parsed OCR entries into `ocr_entries`
- Rewrites each entry's `canvas`/`manifest` URL from whatever origin the source annotation file carries to this environment's `PUBLIC_URL` before storing it
- Deletes any existing `ocr_entries` rows for that collection+item **before** ingesting new ones (so re-running never leaves stale/duplicate rows)
- The delete-lookup filters `collection_id` by a **string**, matching the type entries are created with (regression test — this was previously `Number(id)`, silently matching nothing against a text-typed column, so old rows never actually got cleared)
- Responds `404` when none of the fetched annotation files contain parseable OCR text (and doesn't call `createMany` in that case)

### `GET /search/:collection/:file_id`
- Route is registered on the router
- Responds `400` when the `q` query parameter is missing
- Queries `ocr_entries` filtered by `text: {_icontains: q}` scoped to the requested `collection`/`file_id`
- Returns a full IIIF Search API v1 response built from the matched entries
- Handles both possible `ItemsService.readByQuery` response shapes (a bare array, or `{ data: [...] }`)

---

## Coverage gaps (known, not yet tested)

- **API layer** (live Directus instance) and **E2E layer** (viewer loads the manifest, e.g. Mirador) are manual-only per the README's test pyramid — no automated coverage exists or is currently planned for these.
- Error paths are not covered: e.g. what happens when `IIIF_settings` has no row for the requested collection (`fieldSettings[0]` would be `undefined`), or when `ItemsService.readOne`/`readByQuery` rejects. The handler has no `try/catch` around its async body and never calls `next(error)`, so today these would surface as unhandled rejections rather than a clean HTTP error response — worth fixing and covering with a test if this becomes a real-world issue (e.g. a collection is renamed without updating `IIIF_settings`).
