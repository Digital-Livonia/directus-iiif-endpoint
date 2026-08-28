// sisse tulev väärtus on faili ID
// selle järgi pärida faili mõõtmed directus_files tabelist ning asendada height ja width väärtused
// kas api väljund cachetakse kuidagi? tegelit poleks vaja ju uusi päringuid teha alati ...

import {
  createItemArray,
  createIiifCollectionJson,
  extractOcrEntriesFromAnnotationPage,
  buildIiifSearchResponse,
  rewriteAnnotationPageOrigin
} from './helpers.js'

const directusEndpoint = process.env.PUBLIC_URL
const imageServerUrl = process.env.IIIF_IMAGE_SERVER
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

export default {
  id: 'iiif',
  handler: (router, { services, exceptions }) => {
    const { ItemsService } = services
    // const { ServiceUnavailableException } = exceptions

    router.get('/', (req, res) => res.send('IIIF'))
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
          const fileId = req.params.file_id
          const collection = req.params.collection
          const itemServiceSetting = new ItemsService('IIIF_settings', {
            schema: req.schema,
            accountability: req.accountability
          })
          const itemServiceCollection = new ItemsService(collection, {
            schema: req.schema,
            accountability: req.accountability
          })
          const itemServiceFiles = new ItemsService('directus_files', {
            schema: req.schema,
            accountability: req.accountability
          })

          const fieldSettings = await itemServiceSetting.readByQuery({
            filter: { iiif_collection: { _eq: collection } }
          })
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
          } = fieldSettings[0]

          const collectionDataFields = [
          `${iiif_file}.*`,
          iiif_canvas_label,
          `${annotation_files}.*`,
          `${alto_files}.*`,
          `${txt_files}.*`
          ]

          // let's add fields from the user defined configuration
          iiif_meta.map((item) => collectionDataFields.push(`${item.Value}`))
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
          })
          // Same hang risk as the fieldSettings guard above: readOne() can
          // resolve to a falsy value for a nonexistent/inaccessible item on
          // some Directus versions/permission setups instead of throwing
          // (the throwing case is now caught by the try/catch around this
          // whole handler) -- guard both paths explicitly rather than rely
          // on only one of them.
          if (!collectionData) {
            return res.status(404).json({ error: `Item ${fileId} not found in collection "${collection}"` })
          }
          const imageArray = collectionData[iiif_file]
          const annotationArray = collectionData[`${annotation_files}`]
          const txtArray = collectionData[`${txt_files}`]
          const altoArray = collectionData[`${alto_files}`]
          const canvasLabel = collectionData[iiif_canvas_label]
          const imageDataArray = []
          const annotationDataArray = []
          const altoDataArray = []
          const txtDataArray = []

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
              )
              imageDataArray.push(imageData)
            })
          )

          let annotation_sorted = []
          if (typeof annotationArray !== 'undefined') {
            await Promise.all(
              annotationArray.map(async (item) => {
                const annotationData = await itemServiceFiles.readOne(
                  item.directus_files_id,
                  {
                    fields: ['id', 'title', 'filename_download']
                  }
                )
                annotationDataArray.push(annotationData)
              })
            )
            annotation_sorted = annotationDataArray.sort((a, b) =>
              a.title > b.title ? 1 : -1
            )
          }

          let txt_files_sorted = []
          if (typeof txtArray !== 'undefined') {
            await Promise.all(
              txtArray.map(async (item) => {
                const txtData = await itemServiceFiles.readOne(
                  item.directus_files_id,
                  {
                    fields: ['id', 'title', 'filename_download']
                  }
                )
                txtDataArray.push(txtData)
              })
            )
            txt_files_sorted = txtDataArray.sort((a, b) =>
              a.title > b.title ? 1 : -1
            )
          }

          let alto_sorted = []
          if (typeof altoArray !== 'undefined') {
            await Promise.all(
              altoArray.map(async (item) => {
                const altoData = await itemServiceFiles.readOne(
                  item.directus_files_id,
                  {
                    fields: ['id', 'title', 'filename_download']
                  }
                )
                altoDataArray.push(altoData)
              })
            )
            alto_sorted = altoDataArray.sort((a, b) =>
              a.title > b.title ? 1 : -1
            )
          }

          const iiifMetaItems = iiif_meta.map((item) => {
            const iiifMetaArray = []
            iiifMetaArray.push(`${item.Key}`, collectionData[`${item.Value}`])
            return iiifMetaArray
          })
          const image_sorted = imageDataArray.sort((a, b) =>
            a.title > b.title ? 1 : -1
          )

          const items = createItemArray(image_sorted, annotation_sorted, directusEndpoint, imageServerUrl, alto_sorted, txt_files_sorted)
          const hasAnnotations = annotation_sorted.length > 0

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
          )
        } catch (error) {
          next(error)
        }
      }
    )

    router.post('/parse-ocr', async function (req, res, next) {
      try {
        const { collection, id } = req.body
        if (!collection || !id) {
          return res.status(400).json({ error: '`collection` and `id` are required' })
        }

        const itemServiceSetting = new ItemsService('IIIF_settings', {
          schema: req.schema,
          accountability: req.accountability
        })
        const [settings] = await itemServiceSetting.readByQuery({
          filter: { iiif_collection: { _eq: collection } },
          fields: ['annotation_files']
        })
        const annotationField = (settings && settings.annotation_files) || 'annotations'

        const itemServiceCollection = new ItemsService(collection, {
          schema: req.schema,
          accountability: req.accountability
        })
        const [collectionItem] = await itemServiceCollection.readByQuery({
          filter: { id: { _eq: id } },
          fields: [`${annotationField}.directus_files_id`],
          deep: { [annotationField]: { _limit: -1 } }
        })
        const annotationFiles = Array.isArray(collectionItem[annotationField])
          ? collectionItem[annotationField]
          : []

        if (annotationFiles.length === 0) {
          return res.status(404).json({ error: `No files found in "${annotationField}" for item ${id}` })
        }

        const requestOrigin = `${req.protocol}://${req.get('host')}`
        let ocrEntries = []
        for (const { directus_files_id: fileId } of annotationFiles) {
          const response = await fetch(`${requestOrigin}/assets/${fileId}`)
          if (!response.ok) {
            throw new Error(`Failed to fetch asset ${fileId}: ${response.statusText}`)
          }
          const annotationPage = await response.json()
          ocrEntries = ocrEntries.concat(
            extractOcrEntriesFromAnnotationPage(annotationPage, collection, id, directusEndpoint)
          )
        }

        if (ocrEntries.length === 0) {
          return res.status(404).json({ error: 'No valid annotations found in your JSON files' })
        }

        const itemServiceOcr = new ItemsService('ocr_entries', {
          schema: req.schema,
          accountability: req.accountability
        })
        const existing = await itemServiceOcr.readByQuery({
          filter: { collection_name: { _eq: collection }, collection_id: { _eq: String(id) } },
          fields: ['id'],
          limit: -1
        })
        const existingIds = (Array.isArray(existing) ? existing : existing.data || []).map((row) => row.id)
        if (existingIds.length > 0) {
          await itemServiceOcr.deleteMany(existingIds)
        }

        const created = await itemServiceOcr.createMany(ocrEntries)
        res.json({ success: true, created: created.length })
      } catch (error) {
        next(error)
      }
    })

    router.get('/search/:collection/:file_id', async function (req, res, next) {
      try {
        const { collection, file_id: fileId } = req.params
        const { q } = req.query
        if (!q) {
          return res.status(400).json({ error: 'Missing `q` query parameter' })
        }

        const itemServiceOcr = new ItemsService('ocr_entries', {
          schema: req.schema,
          accountability: req.accountability
        })
        const results = await itemServiceOcr.readByQuery({
          filter: {
            text: { _icontains: q },
            collection_name: { _eq: collection },
            collection_id: { _eq: String(fileId) }
          },
          limit: 100,
          fields: ['id', 'text', 'x', 'y', 'width', 'height', 'canvas', 'manifest']
        })
        const entries = Array.isArray(results) ? results : results.data || []

        const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`
        res.json(buildIiifSearchResponse(entries, requestUrl, directusEndpoint))
      } catch (error) {
        next(error)
      }
    })

    router.get('/annotation-page/:fileId', async function (req, res, next) {
      try {
        const { fileId } = req.params
        const requestOrigin = `${req.protocol}://${req.get('host')}`
        const response = await fetch(`${requestOrigin}/assets/${fileId}`)
        if (!response.ok) {
          return res.status(response.status).json({ error: `Failed to fetch asset ${fileId}` })
        }
        const annotationPage = await response.json()
        res.json(rewriteAnnotationPageOrigin(annotationPage, directusEndpoint))
      } catch (error) {
        next(error)
      }
    })
  }
}
