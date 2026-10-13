function findIdByFile (annotations, filename_download) {
  const annotation = annotations.find(
    (annotation) => annotation.filename_download === filename_download
  );
  return annotation ? annotation.id : false
}

// Points at this extension's own /annotation-page/:fileId route rather than
// the raw stored asset, so the annotation content gets origin-rewritten on
// every request (see rewriteAnnotationPageOrigin below) instead of forever
// carrying whatever domain it was converted against.
function getAnnotations (annotations, filename_download, directusEndpoint) {
  const annoId = findIdByFile(annotations, filename_download);
  if (annoId) {
    return {
      id: `${directusEndpoint}/iiif/annotation-page/${annoId}`,
      type: 'AnnotationPage'
    }
  } else return null
}

// IIIF v3 draws a line between `rendering` (an alternate whole-resource
// representation, e.g. a PDF of the same page) and `seeAlso` (a
// machine-readable companion resource, e.g. OCR data). ALTO/plain-text
// belong on seeAlso — see https://iiif.io/api/cookbook/recipe/0053-seeAlso/
function getAltoSeeAlso (altoFiles, filename_download, directusEndpoint) {
  const directusAssets = `${directusEndpoint}/assets/`;
  const altoId = findIdByFile(altoFiles, filename_download);
  if (altoId) {
    return {
      id: `${directusAssets}${altoId}.xml`,
      type: 'Dataset',
      label: { en: ['ALTO XML'] },
      format: 'text/xml',
      profile: 'http://www.loc.gov/standards/alto/ns-v4#'
    }
  } else return null
}

function getTextSeeAlso (txtFiles, filename_download, directusEndpoint) {
  const directusAssets = `${directusEndpoint}/assets/`;
  const txtId = findIdByFile(txtFiles, filename_download);
  if (txtId) {
    return {
      id: `${directusAssets}${txtId}.txt`,
      type: 'Dataset',
      label: { en: ['Plain text'] },
      format: 'text/plain'
    }
  } else return null
}

const createItemArray = (results, annotations, directusEndpoint, imageServerUrl, altoFiles = [], txtFiles = []) => {
  const directusAssets = `${directusEndpoint}/assets/`;
  const thumbWidth = 100;
  return results.map((item, index) => {
    const stem = item.filename_download.split('.')[0];
    const annotationData = getAnnotations(annotations, `${stem}.json`, directusEndpoint);
    const altoData = getAltoSeeAlso(altoFiles, `${stem}.xml`, directusEndpoint);
    const txtData = getTextSeeAlso(txtFiles, `${stem}.txt`, directusEndpoint);
    const seeAlso = [altoData, txtData].filter(Boolean);

    const renderingItems = [
      {
        id: `${directusAssets}${item.id}?download=${item.filename_download}`,
        type: 'Text',
        label: {
          en: [
                        `Download original (${item.filename_download
                            .split('.')
                            .pop()
                            .toUpperCase()})`
          ]
        },
        format: item.type
      }
    ];

    return {
      id: `${directusEndpoint}/iiif/canvas/${index + 1}`,
      label: {
        none: [`${index + 1}`]
      },
      filename: `${item.filename_download}`,
      type: 'Canvas',
      height: item.height,
      width: item.width,
      thumbnail: [
        {
          id: `${directusAssets}${item.id}?key=thumbnail`,
          type: 'Image',
          format: 'image/png',
          width: thumbWidth,
          height: Math.round((thumbWidth * item.height) / item.width)
        }
      ],
      items: [
        {
          id: `${directusEndpoint}/iiif/image/page/${index + 1}`,
          type: 'AnnotationPage',
          items: [
            {
              id: `${directusEndpoint}/iiif/image/${index + 1}`,
              type: 'Annotation',
              motivation: 'painting',
              body: {
                id: `${imageServerUrl}${item.filename_disk}/full/max/0/default.webp`,
                type: 'Image',
                format: 'image/jpeg',
                height: item.height,
                width: item.width,
                service: [
                  {
                    type: 'ImageService3',
                    id: `${imageServerUrl}${item.filename_disk}`,
                    profile: 'level1'
                  }
                ]
              },
              target: `${directusEndpoint}/iiif/canvas/${index + 1}`
            }
          ]
        }
      ],
      ...(annotationData ? { annotations: [annotationData] } : {}),
      ...(seeAlso.length > 0 ? { seeAlso } : {}),
      rendering: renderingItems
    }
  })
};

// Manifest locales -> the language codes Directus stores on translation rows
// (same mapping dl-app uses, see getDirectusLanguageCode there).
const META_LOCALES = { et: 'et-EE', en: 'en-US' };

const isFilled = (v) => v !== null && v !== undefined && `${v}`.trim() !== '';

// A configured iiif_meta `Value` is either a plain field name on the item
// ("date") or a path into a translations relation ("translations.title").
// Plain fields come back as-is. Translation paths come back as
// { localized: true, values: { et, en } }, where a locale with no row of its
// own falls back to the first row that has a value, so a single translation
// shows in every language. Returns null when nothing is filled.
function resolveMetaValue (data, path) {
  if (!data || !path) return null
  const dot = `${path}`.indexOf('.');
  if (dot === -1) return data[path]
  const rows = data[path.slice(0, dot)];
  const key = path.slice(dot + 1);
  if (!Array.isArray(rows)) return null
  const codeOf = (r) => r?.languages_code?.code ?? r?.languages_code;
  const fallback = rows.find((r) => isFilled(r?.[key]))?.[key];
  if (fallback === undefined) return null
  const values = {};
  for (const [locale, code] of Object.entries(META_LOCALES)) {
    const own = rows.find((r) => codeOf(r) === code && isFilled(r?.[key]));
    values[locale] = own ? own[key] : fallback;
  }
  return { localized: true, values }
}

// The Directus `fields` entries needed to read a configured Value path.
function metaFieldsFor (path) {
  const dot = `${path}`.indexOf('.');
  if (dot === -1) return [`${path}`]
  const relation = path.slice(0, dot);
  return [path, `${relation}.languages_code`]
}

// IIIF language map for one metadata label/value. A scalar is repeated for
// every locale; a localized value is spread per locale.
const toLanguageMap = (value) => {
  const localized = value && value.localized === true;
  return Object.fromEntries(
    Object.keys(META_LOCALES).map((locale) => [
      locale,
      [`${localized ? value.values[locale] : value}`]
    ])
  )
};

const createIiifCollectionJson = (
  canvasLabel,
  items,
  collection,
  fileId,
  iiifMeta,
  sorted,
  hasAnnotations = false,
  directusEndpoint
) => {
  // omit metadata rows with no value entirely, rather than showing a
  // literal "null" - a missing IIIF_settings-configured field means
  // there's nothing to display, not that "null" is the value
  const iiifMetaItems = iiifMeta
    .filter((item) => item[1] !== null && item[1] !== undefined)
    .map((item) => ({
      label: toLanguageMap(item[0]),
      value: toLanguageMap(item[1])
    }));

  return {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    sorted,
    id: `${directusEndpoint}/iiif/manifest/${collection}/${fileId}`,
    type: 'Manifest',
    label: toLanguageMap(canvasLabel),
    metadata: iiifMetaItems,
    items,
    ...(hasAnnotations
      ? {
          // handled by this same extension's own /search/:collection/:file_id
          // route (see index.js) - mirrors the manifest's own id shape
          service: {
            '@id': `${directusEndpoint}/iiif/search/${collection}/${fileId}`,
            '@context': 'http://iiif.io/api/search/1/context.json',
            profile: 'http://iiif.io/api/search/1/search'
          }
        }
      : {})
  }
};

// Annotation files are converted upstream (outside this repo) with absolute
// canvas/manifest URLs baked in for whichever host was current at
// conversion time. Since annotation files are shared across environments
// (same file storage), that origin can be wrong for whichever environment
// is actually running /parse-ocr right now. Rewrite it to directusEndpoint
// (same PUBLIC_URL every other id in this extension is built from) so
// search results always link back into the environment that served them,
// not wherever the file happened to be converted for.
function rewriteToCurrentOrigin (url, directusEndpoint) {
  if (typeof url !== 'string' || !url || !directusEndpoint) return url
  try {
    const { pathname, search, hash } = new URL(url);
    return `${directusEndpoint}${pathname}${search}${hash}`
  } catch {
    return url
  }
}

// Same fix as extractOcrEntriesFromAnnotationPage above, applied to a whole
// annotation page instead of flattened ocr_entries rows - used by
// GET /annotation-page/:fileId (index.js) so canvas.annotations[] links
// always resolve to the current environment, not wherever the file was
// converted for. Returns a new object; doesn't mutate the input.
function rewriteAnnotationPageOrigin (annotationPage, directusEndpoint) {
  if (!directusEndpoint) return annotationPage

  const rewriteResource = (resource) => {
    const rewritten = { ...resource };
    if (typeof resource.id === 'string') rewritten.id = rewriteToCurrentOrigin(resource.id, directusEndpoint);
    if (typeof resource['@id'] === 'string') rewritten['@id'] = rewriteToCurrentOrigin(resource['@id'], directusEndpoint);
    if (typeof resource.on === 'string') rewritten.on = rewriteToCurrentOrigin(resource.on, directusEndpoint);
    if (typeof resource.target === 'string') rewritten.target = rewriteToCurrentOrigin(resource.target, directusEndpoint);
    if (resource.within?.['@id']) {
      rewritten.within = { ...resource.within, '@id': rewriteToCurrentOrigin(resource.within['@id'], directusEndpoint) };
    }
    if (resource.partOf?.id) {
      rewritten.partOf = { ...resource.partOf, id: rewriteToCurrentOrigin(resource.partOf.id, directusEndpoint) };
    }
    // the nested content object (v2: `resource`, v3: `body`) can carry its
    // own @id/id too - Mirador falls back to this as the annotation's
    // identity when the outer annotation has none of its own, e.g. to track
    // "currently selected annotation" in the sidebar panel. Missing this
    // was the actual cause of a Mirador crash (reading .targetId of
    // undefined) after 1.0.11 shipped - the outer on/within were already
    // rewritten, but this nested id wasn't, so it still pointed elsewhere.
    if (resource.resource?.['@id']) {
      rewritten.resource = { ...resource.resource, '@id': rewriteToCurrentOrigin(resource.resource['@id'], directusEndpoint) };
    }
    if (resource.body?.id) {
      rewritten.body = { ...resource.body, id: rewriteToCurrentOrigin(resource.body.id, directusEndpoint) };
    }
    return rewritten
  };

  const key = Array.isArray(annotationPage.resources)
    ? 'resources'
    : Array.isArray(annotationPage.items)
      ? 'items'
      : Array.isArray(annotationPage.annotations)
        ? 'annotations'
        : null;

  const rewritten = { ...annotationPage };
  if (typeof annotationPage.id === 'string') rewritten.id = rewriteToCurrentOrigin(annotationPage.id, directusEndpoint);
  if (typeof annotationPage['@id'] === 'string') rewritten['@id'] = rewriteToCurrentOrigin(annotationPage['@id'], directusEndpoint);
  if (key) rewritten[key] = annotationPage[key].map(rewriteResource);

  return rewritten
}

// The annotation array of a stored annotation list, whichever shape it
// was written in: v2 AnnotationList `resources`, v3 AnnotationPage
// `items`, or a bare `annotations` array.
function getAnnotationResources (annotationPage) {
  if (!annotationPage) return []
  return Array.isArray(annotationPage.resources)
    ? annotationPage.resources
    : Array.isArray(annotationPage.items)
      ? annotationPage.items
      : Array.isArray(annotationPage.annotations)
        ? annotationPage.annotations
        : []
}

// Annotation files below this size are fetched and checked for emptiness
// before being linked from the manifest; anything larger can't be an empty
// list. An empty converted list is ~280 bytes, one OCR line ~900 bytes.
const EMPTY_ANNOTATION_CHECK_MAX_BYTES = 1024;

// Whether a directus_files row (with `filesize`) is small enough that it
// might be an empty annotation list. Unknown size -> not checked, linked
// as before.
function mightBeEmptyAnnotationFile (file) {
  const size = Number(file?.filesize);
  return Number.isFinite(size) && size > 0 && size < EMPTY_ANNOTATION_CHECK_MAX_BYTES
}

// Turns one already-fetched W3C/OA annotation list JSON (as stored in the
// `annotation_files` file assets) into flat rows ready for the `ocr_entries`
// collection. Pure/testable - no fetch, no Directus service calls here;
// POST /parse-ocr (index.js) does the fetching and DB writes.
function extractOcrEntriesFromAnnotationPage (annotationPage, collectionName, collectionId, directusEndpoint) {
  const resources = getAnnotationResources(annotationPage);

  const entries = [];
  for (const resource of resources) {
    const text = resource.resource?.chars ?? resource.body?.value;
    if (typeof text !== 'string') continue

    const on = resource.on ?? resource.target;
    if (typeof on !== 'string') continue

    const [canvas, xywhPart] = on.split('#xywh=');
    if (!xywhPart) continue

    const coords = xywhPart.split(',').map(Number);
    if (coords.length !== 4 || coords.some((n) => Number.isNaN(n))) continue

    const [x, y, width, height] = coords;
    const manifest = resource.within?.['@id'] ?? resource.partOf?.id ?? '';

    entries.push({
      text,
      x,
      y,
      width,
      height,
      canvas: rewriteToCurrentOrigin(canvas, directusEndpoint),
      manifest: rewriteToCurrentOrigin(manifest, directusEndpoint),
      collection_name: collectionName,
      collection_id: String(collectionId)
    });
  }
  return entries
}

// Builds the IIIF Content Search API v1 response from already-queried
// ocr_entries rows. Pure/testable - GET /search/:collection/:file_id
// (index.js) does the querying.
function buildIiifSearchResponse (entries, requestUrl, directusEndpoint) {
  const resources = [];
  const hits = [];

  for (const entry of entries) {
    const annId = `${directusEndpoint}/iiif/annotation/${entry.id}`;
    const on = `${entry.canvas}#xywh=${entry.x},${entry.y},${entry.width},${entry.height}`;

    resources.push({
      '@id': annId,
      '@type': 'oa:Annotation',
      motivation: 'sc:painting',
      resource: {
        '@type': 'cnt:ContentAsText',
        format: 'text/plain',
        chars: entry.text
      },
      on,
      within: { '@id': entry.manifest, '@type': 'sc:Manifest' }
    });

    hits.push({
      '@type': 'search:Hit',
      match: entry.text,
      annotations: [annId],
      on
    });
  }

  return {
    '@context': 'http://iiif.io/api/search/1/context.json',
    '@id': requestUrl,
    '@type': 'sc:AnnotationList',
    within: { '@type': 'sc:Layer', total: resources.length },
    resources,
    hits
  }
}

// sisse tulev väärtus on faili ID
// selle järgi pärida faili mõõtmed directus_files tabelist ning asendada height ja width väärtused
// kas api väljund cachetakse kuidagi? tegelit poleks vaja ju uusi päringuid teha alati ...


const directusEndpoint = process.env.PUBLIC_URL;
const imageServerUrl = process.env.IIIF_IMAGE_SERVER;
/*
const createIiifSingleImageJson = (fileId, height, width) => ({
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: `${directusEndpoint}/iiif/manifest/file/${fileId}`,
  type: 'Manifest',
  label: {
    en: ['Image']
  },
  rights: 'http://creativecommons.org/licenses/by/4.0/',
  items: [
    {
      id: `${directusEndpoint}/iiif/canvas/1`,
      type: 'Canvas',
      height,
      width,
      items: [
        {
          id: `${directusEndpoint}/iiif/image/page/1`,
          type: 'AnnotationPage',
          items: [
            {
              id: `${directusEndpoint}/iiif/image/1`,
              type: 'Annotation',
              motivation: 'painting',
              body: {
                id: `${directusAssets}${fileId}?format=jpg`,
                type: 'Image',
                format: 'image/jpeg',
                height,
                width
              },
              target: `${directusEndpoint}/iiif/canvas/1`
            }
          ]
        }
      ]
    }
  ]
})
*/

var index = {
  id: 'iiif',
  handler: (router, { services, exceptions }) => {
    const { ItemsService } = services;
    // const { ServiceUnavailableException } = exceptions

    router.get('/', (req, res) => res.send('IIIF'));
    /* router.get("/manifest/file/:file_id", function (req, res, next) {
      const fileService = new ItemsService("directus_files", {
        schema: req.schema,
        accountability: req.accountability,
      });
      const fileId = req.params.file_id;
      fileService
        .readOne(fileId, { fields: ["width", "height"] })
        .then((results) =>
          res.send(
            createIiifSingleImageJson(fileId, results.height, results.width)
          )
        )
        .catch((error) => {
          return next(new ServiceUnavailableException(error.message));
        });
    }); */
    router.get(
      '/manifest/:collection/:file_id',
      async function (req, res, next) {
        try {
          const fileId = req.params.file_id;
          const collection = req.params.collection;
          const itemServiceSetting = new ItemsService('IIIF_settings', {
            schema: req.schema,
            accountability: req.accountability
          });
          const itemServiceCollection = new ItemsService(collection, {
            schema: req.schema,
            accountability: req.accountability
          });
          const itemServiceFiles = new ItemsService('directus_files', {
            schema: req.schema,
            accountability: req.accountability
          });

          const fieldSettings = await itemServiceSetting.readByQuery({
            filter: { iiif_collection: { _eq: collection } }
          });
          // Without this guard, a collection with no matching IIIF_settings
          // row (or, further down, a deleted/nonexistent item) makes the
          // `const { ... } = fieldSettings[0]` destructure throw
          // synchronously inside this async handler. With no try/catch
          // around it, that rejection was never turned into a response --
          // Express doesn't send one on its own -- so the connection just
          // hung until the client's own timeout, instead of returning 404.
          // Found via a real hang against a since-deleted record's manifest.
          if (!fieldSettings[0]) {
            return res.status(404).json({ error: `No IIIF_settings configured for collection "${collection}"` })
          }
          const {
            iiif_file,
            iiif_canvas_label,
            iiif_meta,
            annotation_files,
            alto_files,
            txt_files
          } = fieldSettings[0];

          const collectionDataFields = [
          `${iiif_file}.*`,
          ...metaFieldsFor(iiif_canvas_label),
          `${annotation_files}.*`,
          `${alto_files}.*`,
          `${txt_files}.*`
          ];

          // let's add fields from the user defined configuration
          iiif_meta.forEach((item) => collectionDataFields.push(...metaFieldsFor(item.Value)));
          const collectionData = await itemServiceCollection.readOne(fileId, {
            fields: collectionDataFields,
            limit: -1,
            deep: {
              [iiif_file]: {
                _limit: -1
              },
              [annotation_files]: {
                _limit: -1
              },
              [txt_files]: {
                _limit: -1
              },
              [alto_files]: {
                _limit: -1
              }
            }
          });
          // Same hang risk as the fieldSettings guard above: readOne() can
          // resolve to a falsy value for a nonexistent/inaccessible item on
          // some Directus versions/permission setups instead of throwing
          // (the throwing case is now caught by the try/catch around this
          // whole handler) -- guard both paths explicitly rather than rely
          // on only one of them.
          if (!collectionData) {
            return res.status(404).json({ error: `Item ${fileId} not found in collection "${collection}"` })
          }
          const imageArray = collectionData[iiif_file];
          const annotationArray = collectionData[`${annotation_files}`];
          const txtArray = collectionData[`${txt_files}`];
          const altoArray = collectionData[`${alto_files}`];
          const canvasLabel = resolveMetaValue(collectionData, iiif_canvas_label);
          const imageDataArray = [];
          const annotationDataArray = [];
          const altoDataArray = [];
          const txtDataArray = [];

          await Promise.all(
            imageArray.map(async (item) => {
              const imageData = await itemServiceFiles.readOne(
                item.directus_files_id,
                {
                  fields: [
                    'id',
                    'width',
                    'height',
                    'title',
                    'filename_download',
                    'filename_disk',
                    'author',
                    'date'
                  ]
                }
              );
              imageDataArray.push(imageData);
            })
          );

          let annotation_sorted = [];
          if (typeof annotationArray !== 'undefined') {
            await Promise.all(
              annotationArray.map(async (item) => {
                const annotationData = await itemServiceFiles.readOne(
                  item.directus_files_id,
                  {
                    fields: ['id', 'title', 'filename_download', 'filesize']
                  }
                );
                annotationDataArray.push(annotationData);
              })
            );
            annotation_sorted = annotationDataArray.sort((a, b) =>
              a.title > b.title ? 1 : -1
            );
            // A page whose converted annotation list came out empty still
            // has a file, and linking it makes Mirador open its annotation
            // panel on a page with nothing in it (issue #10). Drop those
            // so the canvas gets no `annotations` and, if every page is
            // empty, the manifest gets no search service either.
            const suspects = annotation_sorted.filter(mightBeEmptyAnnotationFile);
            if (suspects.length > 0) {
              const requestOrigin = `${req.protocol}://${req.get('host')}`;
              const emptyIds = new Set();
              await Promise.all(
                suspects.map(async (file) => {
                  try {
                    const response = await fetch(`${requestOrigin}/assets/${file.id}`);
                    if (!response.ok) return
                    const annotationPage = await response.json();
                    if (getAnnotationResources(annotationPage).length === 0) emptyIds.add(file.id);
                  } catch (error) {
                    // unreadable -> keep the link, same as before this check
                  }
                })
              );
              annotation_sorted = annotation_sorted.filter((file) => !emptyIds.has(file.id));
            }
          }

          let txt_files_sorted = [];
          if (typeof txtArray !== 'undefined') {
            await Promise.all(
              txtArray.map(async (item) => {
                const txtData = await itemServiceFiles.readOne(
                  item.directus_files_id,
                  {
                    fields: ['id', 'title', 'filename_download']
                  }
                );
                txtDataArray.push(txtData);
              })
            );
            txt_files_sorted = txtDataArray.sort((a, b) =>
              a.title > b.title ? 1 : -1
            );
          }

          let alto_sorted = [];
          if (typeof altoArray !== 'undefined') {
            await Promise.all(
              altoArray.map(async (item) => {
                const altoData = await itemServiceFiles.readOne(
                  item.directus_files_id,
                  {
                    fields: ['id', 'title', 'filename_download']
                  }
                );
                altoDataArray.push(altoData);
              })
            );
            alto_sorted = altoDataArray.sort((a, b) =>
              a.title > b.title ? 1 : -1
            );
          }

          const iiifMetaItems = iiif_meta.map((item) => {
            const iiifMetaArray = [];
            iiifMetaArray.push(`${item.Key}`, resolveMetaValue(collectionData, `${item.Value}`));
            return iiifMetaArray
          });
          const image_sorted = imageDataArray.sort((a, b) =>
            a.title > b.title ? 1 : -1
          );

          const items = createItemArray(image_sorted, annotation_sorted, directusEndpoint, imageServerUrl, alto_sorted, txt_files_sorted);
          const hasAnnotations = annotation_sorted.length > 0;

          res.send(
            createIiifCollectionJson(
              canvasLabel,
              items,
              collection,
              fileId,
              iiifMetaItems,
              true, // sorted
              hasAnnotations,
              directusEndpoint
            )
          );
        } catch (error) {
          next(error);
        }
      }
    );

    router.post('/parse-ocr', async function (req, res, next) {
      try {
        const { collection, id } = req.body;
        if (!collection || !id) {
          return res.status(400).json({ error: '`collection` and `id` are required' })
        }

        const itemServiceSetting = new ItemsService('IIIF_settings', {
          schema: req.schema,
          accountability: req.accountability
        });
        const [settings] = await itemServiceSetting.readByQuery({
          filter: { iiif_collection: { _eq: collection } },
          fields: ['annotation_files']
        });
        const annotationField = (settings && settings.annotation_files) || 'annotations';

        const itemServiceCollection = new ItemsService(collection, {
          schema: req.schema,
          accountability: req.accountability
        });
        const [collectionItem] = await itemServiceCollection.readByQuery({
          filter: { id: { _eq: id } },
          fields: [`${annotationField}.directus_files_id`],
          deep: { [annotationField]: { _limit: -1 } }
        });
        const annotationFiles = Array.isArray(collectionItem[annotationField])
          ? collectionItem[annotationField]
          : [];

        if (annotationFiles.length === 0) {
          return res.status(404).json({ error: `No files found in "${annotationField}" for item ${id}` })
        }

        const requestOrigin = `${req.protocol}://${req.get('host')}`;
        let ocrEntries = [];
        for (const { directus_files_id: fileId } of annotationFiles) {
          const response = await fetch(`${requestOrigin}/assets/${fileId}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch asset ${fileId}: ${response.statusText}`)
          }
          const annotationPage = await response.json();
          ocrEntries = ocrEntries.concat(
            extractOcrEntriesFromAnnotationPage(annotationPage, collection, id, directusEndpoint)
          );
        }

        if (ocrEntries.length === 0) {
          return res.status(404).json({ error: 'No valid annotations found in your JSON files' })
        }

        const itemServiceOcr = new ItemsService('ocr_entries', {
          schema: req.schema,
          accountability: req.accountability
        });
        const existing = await itemServiceOcr.readByQuery({
          filter: { collection_name: { _eq: collection }, collection_id: { _eq: String(id) } },
          fields: ['id'],
          limit: -1
        });
        const existingIds = (Array.isArray(existing) ? existing : existing.data || []).map((row) => row.id);
        if (existingIds.length > 0) {
          await itemServiceOcr.deleteMany(existingIds);
        }

        const created = await itemServiceOcr.createMany(ocrEntries);
        res.json({ success: true, created: created.length });
      } catch (error) {
        next(error);
      }
    });

    router.get('/search/:collection/:file_id', async function (req, res, next) {
      try {
        const { collection, file_id: fileId } = req.params;
        const { q } = req.query;
        if (!q) {
          return res.status(400).json({ error: 'Missing `q` query parameter' })
        }

        const itemServiceOcr = new ItemsService('ocr_entries', {
          schema: req.schema,
          accountability: req.accountability
        });
        const results = await itemServiceOcr.readByQuery({
          filter: {
            text: { _icontains: q },
            collection_name: { _eq: collection },
            collection_id: { _eq: String(fileId) }
          },
          limit: 100,
          fields: ['id', 'text', 'x', 'y', 'width', 'height', 'canvas', 'manifest']
        });
        const entries = Array.isArray(results) ? results : results.data || [];

        const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        res.json(buildIiifSearchResponse(entries, requestUrl, directusEndpoint));
      } catch (error) {
        next(error);
      }
    });

    router.get('/annotation-page/:fileId', async function (req, res, next) {
      try {
        const { fileId } = req.params;
        const requestOrigin = `${req.protocol}://${req.get('host')}`;
        const response = await fetch(`${requestOrigin}/assets/${fileId}`);
        if (!response.ok) {
          return res.status(response.status).json({ error: `Failed to fetch asset ${fileId}` })
        }
        const annotationPage = await response.json();
        res.json(rewriteAnnotationPageOrigin(annotationPage, directusEndpoint));
      } catch (error) {
        next(error);
      }
    });
  }
};

export { index as default };
