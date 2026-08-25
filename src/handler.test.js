import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import iiifExtension from './index.js'

// must match PUBLIC_URL / IIIF_IMAGE_SERVER set in vitest.config.js
const BASE = 'http://test.local'
const IMAGE_SERVER = 'http://images.test.local/'

const settingsRow = (overrides = {}) => ({
  iiif_collection: 'books',
  iiif_file: 'images',
  iiif_canvas_label: 'title',
  iiif_meta: [{ Key: 'Autor', Value: 'author_field' }],
  annotation_files: 'annotations',
  alto_files: 'alto',
  txt_files: 'txt',
  ...overrides
})

const fileRow = (overrides = {}) => ({
  id: 'file-1',
  width: 1000,
  height: 2000,
  title: 'Page 1',
  filename_download: 'page1.jpg',
  filename_disk: 'file-1.jpg',
  author: null,
  date: null,
  ...overrides
})

function makeRouter () {
  const routes = { get: {}, post: {} }
  return {
    routes,
    get: (path, fn) => { routes.get[path] = fn },
    post: (path, fn) => { routes.post[path] = fn }
  }
}

function makeRes () {
  return {
    body: undefined,
    statusCode: 200,
    status (code) { this.statusCode = code; return this },
    send (payload) { this.body = payload },
    json (payload) { this.body = payload }
  }
}

describe('IIIF manifest handler — integration (mocked ItemsService)', () => {
  let router, res, next, readByQuery, readOne, deleteMany, createMany, ItemsService

  beforeEach(() => {
    router = makeRouter()
    readByQuery = vi.fn()
    readOne = vi.fn()
    deleteMany = vi.fn()
    createMany = vi.fn()
    // every ItemsService instance (settings/collection/files/ocr) shares
    // these mocks, so call order below reflects handler call order
    ItemsService = vi.fn().mockImplementation(function () {
      return { readByQuery, readOne, deleteMany, createMany }
    })

    iiifExtension.handler(router, { services: { ItemsService }, exceptions: {} })

    res = makeRes()
    next = vi.fn()
  })

  const invokeManifest = (req) => router.routes.get['/manifest/:collection/:file_id'](req, res, next)

  it('registers the manifest route', () => {
    expect(router.routes.get['/manifest/:collection/:file_id']).toBeTypeOf('function')
  })

  it('builds a manifest from settings + collection + file data', async () => {
    readByQuery.mockResolvedValueOnce([settingsRow()])
    readOne
      .mockResolvedValueOnce({
        images: [{ directus_files_id: 'file-1' }],
        title: 'Raamat 1',
        author_field: 'Tammsaare'
      })
      .mockResolvedValueOnce(fileRow())

    await invokeManifest({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(res.body.type).toBe('Manifest')
    expect(res.body.id).toBe(`${BASE}/iiif/manifest/books/item-1`)
    expect(res.body.label).toEqual({ et: ['Raamat 1'] })
    expect(res.body.items).toHaveLength(1)
  })

  it('constructs ItemsService per collection with schema/accountability forwarded from the request', async () => {
    readByQuery.mockResolvedValueOnce([settingsRow()])
    readOne
      .mockResolvedValueOnce({ images: [{ directus_files_id: 'file-1' }], title: 'T', author_field: 'A' })
      .mockResolvedValueOnce(fileRow())

    const req = { params: { collection: 'books', file_id: 'item-1' }, schema: { s: 1 }, accountability: { a: 1 } }
    await invokeManifest(req)

    expect(ItemsService).toHaveBeenCalledWith('IIIF_settings', { schema: req.schema, accountability: req.accountability })
    expect(ItemsService).toHaveBeenCalledWith('books', { schema: req.schema, accountability: req.accountability })
    expect(ItemsService).toHaveBeenCalledWith('directus_files', { schema: req.schema, accountability: req.accountability })
  })

  it('reads IIIF_settings filtered by the requested collection', async () => {
    readByQuery.mockResolvedValueOnce([settingsRow()])
    readOne
      .mockResolvedValueOnce({ images: [{ directus_files_id: 'file-1' }], title: 'T', author_field: 'A' })
      .mockResolvedValueOnce(fileRow())

    await invokeManifest({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(readByQuery).toHaveBeenCalledWith({ filter: { iiif_collection: { _eq: 'books' } } })
  })

  it('maps every configured iiif_meta field from the collection item into manifest metadata', async () => {
    readByQuery.mockResolvedValueOnce([
      settingsRow({
        iiif_meta: [
          { Key: 'Autor', Value: 'author_field' },
          { Key: 'Aasta', Value: 'year_field' }
        ]
      })
    ])
    readOne
      .mockResolvedValueOnce({
        images: [{ directus_files_id: 'file-1' }],
        title: 'Raamat 1',
        author_field: 'Tammsaare',
        year_field: '1934'
      })
      .mockResolvedValueOnce(fileRow())

    await invokeManifest({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(res.body.metadata).toEqual([
      { label: { et: ['Autor'] }, value: { et: ['Tammsaare'] } },
      { label: { et: ['Aasta'] }, value: { et: ['1934'] } }
    ])
  })

  it('omits a metadata row entirely when its underlying field value is null', async () => {
    readByQuery.mockResolvedValueOnce([
      settingsRow({
        iiif_meta: [
          { Key: 'Autor', Value: 'author_field' },
          { Key: 'Fond', Value: 'fond_field' }
        ]
      })
    ])
    readOne
      .mockResolvedValueOnce({
        images: [{ directus_files_id: 'file-1' }],
        title: 'Raamat 1',
        author_field: 'Tammsaare',
        fond_field: null
      })
      .mockResolvedValueOnce(fileRow())

    await invokeManifest({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(res.body.metadata).toEqual([
      { label: { et: ['Autor'] }, value: { et: ['Tammsaare'] } }
    ])
  })

  it('builds the canvas image body via the IIIF Image API, using filename_disk', async () => {
    readByQuery.mockResolvedValueOnce([settingsRow()])
    readOne
      .mockResolvedValueOnce({ images: [{ directus_files_id: 'file-1' }], title: 'T', author_field: 'A' })
      .mockResolvedValueOnce(fileRow({ filename_disk: 'abc-123.jpg' }))

    await invokeManifest({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    const body = res.body.items[0].items[0].items[0].body
    expect(body.id).toBe(`${IMAGE_SERVER}abc-123.jpg/full/max/0/default.webp`)
    expect(body.service).toEqual([{ type: 'ImageService3', id: `${IMAGE_SERVER}abc-123.jpg`, profile: 'level1' }])
  })

  it('includes annotations and the search service block when a filename matches an annotation', async () => {
    readByQuery.mockResolvedValueOnce([settingsRow()])
    readOne
      .mockResolvedValueOnce({
        images: [{ directus_files_id: 'file-1' }],
        annotations: [{ directus_files_id: 'anno-1' }],
        title: 'Raamat 1',
        author_field: 'Tammsaare'
      })
      .mockResolvedValueOnce(fileRow({ filename_download: 'page1.jpg' }))
      .mockResolvedValueOnce({ id: 'anno-1', title: 'page1', filename_download: 'page1.json' })

    await invokeManifest({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(res.body.items[0].annotations).toEqual([
      { id: `${BASE}/assets/anno-1.json`, type: 'AnnotationPage' }
    ])
    expect(res.body.service).toBeDefined()
    expect(res.body.service['@id']).toBe(`${BASE}/iiif/search/books/item-1`)
  })

  it('omits annotations and the service block when annotation_files is not configured for the collection item', async () => {
    readByQuery.mockResolvedValueOnce([settingsRow()])
    readOne
      .mockResolvedValueOnce({
        images: [{ directus_files_id: 'file-1' }],
        title: 'Raamat 1',
        author_field: 'Tammsaare'
        // annotations key absent -> typeof undefined
      })
      .mockResolvedValueOnce(fileRow())

    await invokeManifest({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(res.body.items[0].annotations).toBeUndefined()
    expect(res.body.service).toBeUndefined()
  })

  it('includes seeAlso entries when alto_files/txt_files are configured and filenames match', async () => {
    readByQuery.mockResolvedValueOnce([settingsRow()])
    readOne
      .mockResolvedValueOnce({
        images: [{ directus_files_id: 'file-1' }],
        txt: [{ directus_files_id: 'txt-1' }],
        alto: [{ directus_files_id: 'alto-1' }],
        title: 'Raamat 1',
        author_field: 'Tammsaare'
      })
      .mockResolvedValueOnce(fileRow({ filename_download: 'page1.jpg' }))
      .mockResolvedValueOnce({ id: 'txt-1', title: 'page1', filename_download: 'page1.txt' })
      .mockResolvedValueOnce({ id: 'alto-1', title: 'page1', filename_download: 'page1.xml' })

    await invokeManifest({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(res.body.items[0].seeAlso).toEqual([
      {
        id: `${BASE}/assets/alto-1.xml`,
        type: 'Dataset',
        label: { en: ['ALTO XML'] },
        format: 'text/xml',
        profile: 'http://www.loc.gov/standards/alto/ns-v4#'
      },
      {
        id: `${BASE}/assets/txt-1.txt`,
        type: 'Dataset',
        label: { en: ['Plain text'] },
        format: 'text/plain'
      }
    ])
  })

  // ─── POST /parse-ocr ────────────────────────────────────────────────────

  describe('POST /parse-ocr', () => {
    const invoke = (req) => router.routes.post['/parse-ocr'](req, res, next)
    const baseReq = (overrides = {}) => ({
      body: { collection: 'books', id: '26' },
      protocol: 'http',
      get: (header) => (header === 'host' ? 'test.local' : undefined),
      schema: {},
      accountability: {},
      ...overrides
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('registers the /parse-ocr route', () => {
      expect(router.routes.post['/parse-ocr']).toBeTypeOf('function')
    })

    it('responds 400 when collection or id is missing from the body', async () => {
      await invoke(baseReq({ body: { collection: 'books' } }))
      expect(res.statusCode).toBe(400)
      expect(res.body.error).toMatch(/required/)
    })

    it('falls back to the "annotations" field name when IIIF_settings has no row for the collection', async () => {
      readByQuery
        .mockResolvedValueOnce([]) // IIIF_settings lookup: no row
        .mockResolvedValueOnce([{ annotations: [{ directus_files_id: 'anno-1' }] }]) // collection item lookup

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ resources: [{ resource: { chars: 'hi' }, on: 'c1#xywh=1,2,3,4' }] })
      }))
      readByQuery.mockResolvedValueOnce([]) // existing ocr_entries lookup (none to delete)
      createMany.mockResolvedValueOnce([{ id: 1 }])

      await invoke(baseReq())

      expect(readByQuery).toHaveBeenNthCalledWith(2, expect.objectContaining({
        fields: ['annotations.directus_files_id']
      }))
    })

    it('responds 404 when the collection item has no files in the annotation field', async () => {
      readByQuery
        .mockResolvedValueOnce([settingsRow()])
        .mockResolvedValueOnce([{ annotations: [] }])

      await invoke(baseReq())

      expect(res.statusCode).toBe(404)
      expect(res.body.error).toMatch(/No files found/)
    })

    it('fetches each linked annotation asset and ingests parsed OCR entries into ocr_entries', async () => {
      readByQuery
        .mockResolvedValueOnce([settingsRow()])
        .mockResolvedValueOnce([{ annotations: [{ directus_files_id: 'anno-1' }] }])
        .mockResolvedValueOnce([]) // no existing ocr_entries to delete

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          resources: [{ resource: { chars: 'Der Henneppspinner' }, on: 'http://test.local/iiif/canvas/1#xywh=1,2,3,4' }]
        })
      })
      vi.stubGlobal('fetch', fetchMock)
      createMany.mockResolvedValueOnce([{ id: 1 }])

      await invoke(baseReq())

      expect(fetchMock).toHaveBeenCalledWith('http://test.local/assets/anno-1')
      expect(createMany).toHaveBeenCalledWith([
        expect.objectContaining({ text: 'Der Henneppspinner', collection_name: 'books', collection_id: '26' })
      ])
      expect(res.body).toEqual({ success: true, created: 1 })
    })

    it('deletes existing ocr_entries for the item before ingesting new ones', async () => {
      readByQuery
        .mockResolvedValueOnce([settingsRow()])
        .mockResolvedValueOnce([{ annotations: [{ directus_files_id: 'anno-1' }] }])
        .mockResolvedValueOnce([{ id: 101 }, { id: 102 }])

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ resources: [{ resource: { chars: 'x' }, on: 'c1#xywh=0,0,1,1' }] })
      }))
      createMany.mockResolvedValueOnce([{ id: 1 }])

      await invoke(baseReq())

      expect(deleteMany).toHaveBeenCalledWith([101, 102])
    })

    it('responds 404 when none of the fetched annotation files contain parseable OCR text', async () => {
      readByQuery
        .mockResolvedValueOnce([settingsRow()])
        .mockResolvedValueOnce([{ annotations: [{ directus_files_id: 'anno-1' }] }])

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ resources: [] })
      }))

      await invoke(baseReq())

      expect(res.statusCode).toBe(404)
      expect(res.body.error).toMatch(/No valid annotations/)
      expect(createMany).not.toHaveBeenCalled()
    })
  })

  // ─── GET /search/:collection/:file_id ──────────────────────────────────

  describe('GET /search/:collection/:file_id', () => {
    const invoke = (req) => router.routes.get['/search/:collection/:file_id'](req, res, next)
    const baseReq = (overrides = {}) => ({
      params: { collection: 'books', file_id: '26' },
      query: { q: 'geb' },
      protocol: 'https',
      get: (header) => (header === 'host' ? 'test.local' : undefined),
      originalUrl: '/search/books/26?q=geb',
      schema: {},
      accountability: {},
      ...overrides
    })

    it('registers the /search/:collection/:file_id route', () => {
      expect(router.routes.get['/search/:collection/:file_id']).toBeTypeOf('function')
    })

    it('responds 400 when the `q` query parameter is missing', async () => {
      await invoke(baseReq({ query: {} }))
      expect(res.statusCode).toBe(400)
      expect(res.body.error).toMatch(/q/)
    })

    it('queries ocr_entries filtered by text match and the requested collection/item', async () => {
      readByQuery.mockResolvedValueOnce([])
      await invoke(baseReq())
      expect(readByQuery).toHaveBeenCalledWith({
        filter: {
          text: { _icontains: 'geb' },
          collection_name: { _eq: 'books' },
          collection_id: { _eq: '26' }
        },
        limit: 100,
        fields: ['id', 'text', 'x', 'y', 'width', 'height', 'canvas', 'manifest']
      })
    })

    it('returns a IIIF Search API v1 response built from the matched entries', async () => {
      readByQuery.mockResolvedValueOnce([
        {
          id: 1,
          text: 'Gebor',
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          canvas: `${BASE}/iiif/canvas/1`,
          manifest: `${BASE}/iiif/manifest/books/26`
        }
      ])

      await invoke(baseReq())

      expect(res.body['@context']).toBe('http://iiif.io/api/search/1/context.json')
      expect(res.body['@id']).toBe('https://test.local/search/books/26?q=geb')
      expect(res.body.resources).toHaveLength(1)
      expect(res.body.resources[0].resource.chars).toBe('Gebor')
      expect(res.body.hits[0].match).toBe('Gebor')
    })

    it('handles a paginated ItemsService response shape ({ data: [...] })', async () => {
      readByQuery.mockResolvedValueOnce({
        data: [{ id: 1, text: 'Gebor', x: 0, y: 0, width: 1, height: 1, canvas: 'c1', manifest: '' }]
      })

      await invoke(baseReq())

      expect(res.body.resources).toHaveLength(1)
    })
  })
})
