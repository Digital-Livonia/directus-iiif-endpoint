import { describe, it, expect, vi, beforeEach } from 'vitest'
import iiifExtension from './index.js'

// must match PUBLIC_URL / IIIF_SEARCH_URL set in vitest.config.js
const BASE = 'http://test.local'
const SEARCH_URL = 'http://test.local/api/iiif/search'

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
  author: null,
  date: null,
  ...overrides
})

function makeRouter () {
  const routes = {}
  return { routes, get: (path, fn) => { routes[path] = fn } }
}

function makeRes () {
  return { body: undefined, send (payload) { this.body = payload } }
}

describe('IIIF manifest handler — integration (mocked ItemsService)', () => {
  let router, res, next, readByQuery, readOne, ItemsService

  beforeEach(() => {
    router = makeRouter()
    readByQuery = vi.fn()
    readOne = vi.fn()
    // every ItemsService instance (settings/collection/files) shares these
    // mocks, so call order below reflects handler call order
    ItemsService = vi.fn().mockImplementation(function () { return { readByQuery, readOne } })

    iiifExtension.handler(router, { services: { ItemsService }, exceptions: {} })

    res = makeRes()
    next = vi.fn()
  })

  const invoke = (req) => router.routes['/manifest/:collection/:file_id'](req, res, next)

  it('registers the manifest route', () => {
    expect(router.routes['/manifest/:collection/:file_id']).toBeTypeOf('function')
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

    await invoke({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

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
    await invoke(req)

    expect(ItemsService).toHaveBeenCalledWith('IIIF_settings', { schema: req.schema, accountability: req.accountability })
    expect(ItemsService).toHaveBeenCalledWith('books', { schema: req.schema, accountability: req.accountability })
    expect(ItemsService).toHaveBeenCalledWith('directus_files', { schema: req.schema, accountability: req.accountability })
  })

  it('reads IIIF_settings filtered by the requested collection', async () => {
    readByQuery.mockResolvedValueOnce([settingsRow()])
    readOne
      .mockResolvedValueOnce({ images: [{ directus_files_id: 'file-1' }], title: 'T', author_field: 'A' })
      .mockResolvedValueOnce(fileRow())

    await invoke({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

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

    await invoke({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(res.body.metadata).toEqual([
      { label: { et: ['Autor'] }, value: { et: ['Tammsaare'] } },
      { label: { et: ['Aasta'] }, value: { et: ['1934'] } }
    ])
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

    await invoke({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

    expect(res.body.items[0].annotations).toEqual([
      { id: `${BASE}/assets/anno-1.json`, type: 'AnnotationPage' }
    ])
    expect(res.body.service).toBeDefined()
    expect(res.body.service['@id']).toBe(SEARCH_URL)
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

    await invoke({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

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

    await invoke({ params: { collection: 'books', file_id: 'item-1' }, schema: {}, accountability: {} })

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
})
