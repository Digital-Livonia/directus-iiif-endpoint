# Test documentation

A human-readable catalogue of every automated test in this repo — what it asserts and why. For how to run tests, see [README.md § Testing](README.md#testing). This file mirrors the test suite; if you add or rename a test, update the matching entry here too.

Current totals: **154 tests** across 2 files (`npm test`).

---

## Unit layer — `src/helpers.test.js` (115 tests)

Tests the pure builder functions in `src/helpers.js` directly, with no Directus involved — fake image/annotation/ALTO/text objects go in, IIIF JSON comes out.

### `findIdByFile` — filename → id lookup used by every matching feature
- Returns the id when a `filename_download` matches
- Returns `false` when nothing matches
- Returns `false` for an empty list

### `getAnnotations` — builds the `AnnotationPage` link for a matched `.json` annotation file
- Returns an `AnnotationPage` object pointing at this extension's own `/iiif/annotation-page/:fileId` rewriting route (not the raw asset URL) when a match is found
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
- Matched annotation URL points at `/iiif/annotation-page/{id}` (this extension's own rewriting route), not the raw asset

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
- `label` is repeated for every locale (`et` and `en`), not hard-coded to `et`
- `iiifMeta` label/value pairs are repeated for every locale in `metadata`
- `service` block is **absent** when `hasAnnotations` is `false`
- `service` block is present when `hasAnnotations` is `true`
- `service["@id"]` mirrors the manifest `id` shape, with `/search/` instead of `/manifest/` (not a separate configured URL — see [README § Requirements](README.md#requirements))
- Multiple metadata pairs all appear, in order
- A metadata row whose value is `null` is omitted entirely (not rendered as the string `"null"`)
- A metadata row whose value is `undefined` is likewise omitted

### `resolveMetaValue` — a configured field path → its value
- A plain field name returns the item's value unchanged
- `translations.<field>`: each locale (`et` ← `et-EE`, `en` ← `en-US`) is taken from its own translation row
- A locale with no row of its own (or an empty/whitespace one) falls back to the translation that exists
- `languages_code` expanded to an object (`{ code }`) is accepted
- A many-to-one path (`person.people_first_name`) returns the related item's value; `null` related item or `null` value gives `null`
- `null` is returned when no translation has a value

### `metaFieldsFor` — which Directus `fields` a configured path needs
- A plain field is requested as-is
- A relation path (`translations.title`, `person.people_first_name`) is requested via `<relation>.*`, **never** `languages_code` (regression test: naming `languages_code` made Directus answer 403 for `handwritings`, whose `person` relation has no such field)

### `normalizeMetaEntry` — one `iiif_meta` repeater row → `{ field, parseEdtf }`
- A bare string is a field name
- The `meta` (or `field`) subfield of a row is the field name; empty `Key`/`Value` beside it are ignored
- `parse_edtf` is carried as a boolean (`true`/`"true"` only)
- Legacy `Key`/`Value` rows are **no longer read** (return `null`)
- Empty/unknown entries return `null`

### `toMetaList` — the `iiif_meta` setting as a list, whatever type the field is
- Arrays pass through; a delimited string is split; a JSON string is parsed; a single object is wrapped; empty values give `[]`

### `buildFieldLabel` — a field's name as shown in the Data Model
- Uses each language's own field translation (`meta.translations`)
- Falls back to the translation that exists, then to the field name

### `createIiifCollectionJson` — localized and EDTF values
- A localized value/label is emitted per locale
- A translated canvas label becomes a per-locale manifest `label`
- A parsed EDTF value is emitted as the parser's `et`/`en` text

### `createIiifCollectionJson` — `requiredStatement` and `provider` (#8)
- With no collection text the statement is the bilingual project line alone (`et`: Vahendatud Digital Livonia projekti poolt. / `en`: Provided by Digital Livonia project.)
- A collection's `et`/`en` text comes first, the project line always closes it; each language is independent, blank text counts as none
- `provider` carries the logo as an `Image`

### `parseEdtfValue` — EDTF string → the shared parser's text per language
- Table of inputs → `et`/`en` output: exact date, year+month, year, interval, uncertain (`?`), approximate (`~`), unspecified digit (`199X`), open start (`../1300`), set (`[1670..1672]`)
- Surrounding whitespace is trimmed
- Invalid or non-EDTF input (`abc`, `2004-06-11?`, empty, `null`, numbers) returns `null`, so the caller keeps the original value

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

### `rewriteAnnotationPageOrigin` — same origin fix as above, applied to a whole raw annotation page
- Rewrites the annotation page's own top-level `id`/`@id`
- Rewrites each resource's `on` target, keeping the `#xywh=` fragment
- Rewrites each resource's `within["@id"]`, preserving any other `within` fields
- Rewrites the nested content object's own id too (v2: `resource["@id"]`, v3: `body.id`) — Mirador falls back to this as the annotation's identity (e.g. "selected annotation" tracking) when the outer annotation has none of its own; missing this crashed Mirador after 1.0.11 shipped (regression test)
- Leaves everything else about a resource untouched (e.g. `resource.chars`)
- Also handles an IIIF v3 shape (`target`/`partOf.id`), not just v2 (`on`/`within`)
- Returns the input unchanged when no `directusEndpoint` is given (back-compat)
- Does not mutate the input object

---

## Integration layer — `src/handler.test.js` (43 tests)

Tests the actual Directus route handler in `src/index.js`, with `ItemsService` mocked (no real Directus instance). Verifies the full flow: read `IIIF_settings` → read the collection item → read each related file → build the manifest — i.e. that the pieces are wired together correctly, not just that each piece works in isolation.

- Route `/manifest/:collection/:file_id` is registered on the router
- A full manifest (`type`, `id`, `label`, `items`) is built correctly from settings + collection + file data
- `ItemsService` is constructed once per collection (`IIIF_settings`, the target collection, `directus_files`) with the request's `schema`/`accountability` forwarded to each
- The `IIIF_settings` lookup is filtered by the requested `collection` (`iiif_collection: { _eq: … }`)
- Every configured `iiif_meta` field (not just one) is read from the collection item and mapped into manifest `metadata`
- A bare field name is labelled with the field's own Data Model translation (`FieldsService`), per language; a field with none is labelled with its name
- `translations.<field>` paths are read per locale from the item's translations rows, and the request asks for `translations.*` (not `languages_code`)
- A row with `parse_edtf` shows the EDTF value as the parser's `et`/`en` text; without it the value is left exactly as stored
- A `parse_edtf` value that is not valid EDTF keeps the original string, logs a warning, and the manifest is still `200`
- An item with no images (or an image relation the caller cannot read) returns a manifest with empty `items`, not a `500`
- A metadata row is omitted entirely when its underlying field value is `null`
- `iiif_required_statement_et`/`_en` from the `IIIF_settings` row end up in the manifest's `requiredStatement`, followed by the project line; without them only the project line
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

### `GET /annotation-page/:fileId`
- Route is registered on the router
- Fetches the raw asset and returns it with `on`/`within`/`target`/`partOf.id` rewritten to this environment's `PUBLIC_URL`, **including the nested content object's own id** (`resource["@id"]`/`body.id` — regression test, see `rewriteAnnotationPageOrigin` above)
- Fetches the asset from this same host's `/assets/:fileId` (not a hardcoded or cross-environment URL)
- Forwards a non-`ok` upstream status (e.g. `404`) instead of throwing

---

## Coverage gaps (known, not yet tested)

- **API layer** (live Directus instance) and **E2E layer** (viewer loads the manifest, e.g. Mirador) are manual-only per the README's test pyramid — no automated coverage exists or is currently planned for these.
- Error paths other than the ones above are only lightly covered: `ItemsService.readOne`/`readByQuery` rejecting is forwarded to `next(error)` by the handler's `try/catch`, but not every route has its own test for it.
