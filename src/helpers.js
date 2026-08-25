export function findIdByFile (annotations, filename_download) {
  const annotation = annotations.find(
    (annotation) => annotation.filename_download === filename_download
  )
  return annotation ? annotation.id : false
}

export function getAnnotations (annotations, filename_download, directusEndpoint) {
  const directusAssets = `${directusEndpoint}/assets/`
  const annoId = findIdByFile(annotations, filename_download)
  if (annoId) {
    return {
      id: `${directusAssets}${annoId}.json`,
      type: 'AnnotationPage'
    }
  } else return null
}

// IIIF v3 draws a line between `rendering` (an alternate whole-resource
// representation, e.g. a PDF of the same page) and `seeAlso` (a
// machine-readable companion resource, e.g. OCR data). ALTO/plain-text
// belong on seeAlso — see https://iiif.io/api/cookbook/recipe/0053-seeAlso/
export function getAltoSeeAlso (altoFiles, filename_download, directusEndpoint) {
  const directusAssets = `${directusEndpoint}/assets/`
  const altoId = findIdByFile(altoFiles, filename_download)
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

export function getTextSeeAlso (txtFiles, filename_download, directusEndpoint) {
  const directusAssets = `${directusEndpoint}/assets/`
  const txtId = findIdByFile(txtFiles, filename_download)
  if (txtId) {
    return {
      id: `${directusAssets}${txtId}.txt`,
      type: 'Dataset',
      label: { en: ['Plain text'] },
      format: 'text/plain'
    }
  } else return null
}

export const createItemArray = (results, annotations, directusEndpoint, imageServerUrl, altoFiles = [], txtFiles = []) => {
  const directusAssets = `${directusEndpoint}/assets/`
  const thumbWidth = 100
  return results.map((item, index) => {
    const stem = item.filename_download.split('.')[0]
    const annotationData = getAnnotations(annotations, `${stem}.json`, directusEndpoint)
    const altoData = getAltoSeeAlso(altoFiles, `${stem}.xml`, directusEndpoint)
    const txtData = getTextSeeAlso(txtFiles, `${stem}.txt`, directusEndpoint)
    const seeAlso = [altoData, txtData].filter(Boolean)

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
    ]

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
}

export const createIiifCollectionJson = (
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
      label: { et: [`${item[0]}`] },
      value: { et: [`${item[1]}`] }
    }))

  return {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    sorted,
    id: `${directusEndpoint}/iiif/manifest/${collection}/${fileId}`,
    type: 'Manifest',
    label: {
      et: [`${canvasLabel}`]
    },
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
}

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
    const { pathname, search, hash } = new URL(url)
    return `${directusEndpoint}${pathname}${search}${hash}`
  } catch {
    return url
  }
}

// Turns one already-fetched W3C/OA annotation list JSON (as stored in the
// `annotation_files` file assets) into flat rows ready for the `ocr_entries`
// collection. Pure/testable - no fetch, no Directus service calls here;
// POST /parse-ocr (index.js) does the fetching and DB writes.
export function extractOcrEntriesFromAnnotationPage (annotationPage, collectionName, collectionId, directusEndpoint) {
  const resources = Array.isArray(annotationPage.resources)
    ? annotationPage.resources
    : Array.isArray(annotationPage.items)
      ? annotationPage.items
      : Array.isArray(annotationPage.annotations)
        ? annotationPage.annotations
        : []

  const entries = []
  for (const resource of resources) {
    const text = resource.resource?.chars ?? resource.body?.value
    if (typeof text !== 'string') continue

    const on = resource.on ?? resource.target
    if (typeof on !== 'string') continue

    const [canvas, xywhPart] = on.split('#xywh=')
    if (!xywhPart) continue

    const coords = xywhPart.split(',').map(Number)
    if (coords.length !== 4 || coords.some((n) => Number.isNaN(n))) continue

    const [x, y, width, height] = coords
    const manifest = resource.within?.['@id'] ?? resource.partOf?.id ?? ''

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
    })
  }
  return entries
}

// Builds the IIIF Content Search API v1 response from already-queried
// ocr_entries rows. Pure/testable - GET /search/:collection/:file_id
// (index.js) does the querying.
export function buildIiifSearchResponse (entries, requestUrl, directusEndpoint) {
  const resources = []
  const hits = []

  for (const entry of entries) {
    const annId = `${directusEndpoint}/iiif/annotation/${entry.id}`
    const on = `${entry.canvas}#xywh=${entry.x},${entry.y},${entry.width},${entry.height}`

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
    })

    hits.push({
      '@type': 'search:Hit',
      match: entry.text,
      annotations: [annId],
      on
    })
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
