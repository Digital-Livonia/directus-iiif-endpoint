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

export const createItemArray = (results, annotations, directusEndpoint, altoFiles = [], txtFiles = []) => {
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
                id: `${directusAssets}${item.id}?format=jpg`,
                type: 'Image',
                format: 'image/jpeg',
                height: item.height,
                width: item.width
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
          // the actual IIIF Content Search implementation is a sibling
          // Directus extension mounted at /iiif/search/:collection/:file_id
          // on this same host - mirrors the manifest's own id shape
          service: {
            '@id': `${directusEndpoint}/iiif/search/${collection}/${fileId}`,
            '@context': 'http://iiif.io/api/search/1/context.json',
            profile: 'http://iiif.io/api/search/1/search'
          }
        }
      : {})
  }
}
