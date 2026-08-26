import { describe, it, expect } from 'vitest'
import {
  findIdByFile,
  getAnnotations,
  getAltoSeeAlso,
  getTextSeeAlso,
  createItemArray,
  createIiifCollectionJson,
  extractOcrEntriesFromAnnotationPage,
  buildIiifSearchResponse,
  rewriteAnnotationPageOrigin
} from './helpers.js'

const BASE = 'http://test.local'
const IMAGE_SERVER = 'http://images.test.local/'

const makeImage = (overrides = {}) => ({
  id: 'img-uuid-1',
  title: 'Page 001',
  filename_download: 'page001.jpg',
  filename_disk: 'img-uuid-1.jpg',
  width: 2000,
  height: 3000,
  type: 'image/jpeg',
  author: null,
  date: null,
  ...overrides
})

const makeAnnotation = (overrides = {}) => ({
  id: 'anno-uuid-1',
  title: 'page001',
  filename_download: 'page001.json',
  ...overrides
})

const makeAlto = (overrides = {}) => ({
  id: 'alto-uuid-1',
  title: 'page001',
  filename_download: 'page001.xml',
  ...overrides
})

const makeTxt = (overrides = {}) => ({
  id: 'txt-uuid-1',
  title: 'page001',
  filename_download: 'page001.txt',
  ...overrides
})

// ─── Layer 1: Unit ─────────────────────────────────────────────────────────

describe('findIdByFile', () => {
  it('returns id when filename matches', () => {
    expect(findIdByFile([makeAnnotation()], 'page001.json')).toBe('anno-uuid-1')
  })

  it('returns false when no match', () => {
    expect(findIdByFile([makeAnnotation()], 'page999.json')).toBe(false)
  })

  it('returns false for empty array', () => {
    expect(findIdByFile([], 'page001.json')).toBe(false)
  })
})

describe('getAnnotations', () => {
  it('returns AnnotationPage pointing at this extension\'s own rewriting route, not the raw asset', () => {
    expect(getAnnotations([makeAnnotation()], 'page001.json', BASE)).toEqual({
      id: `${BASE}/iiif/annotation-page/anno-uuid-1`,
      type: 'AnnotationPage'
    })
  })

  it('returns null when annotation not found', () => {
    expect(getAnnotations([], 'page001.json', BASE)).toBeNull()
  })
})

describe('createItemArray — canvas structure', () => {
  it('returns one canvas per image', () => {
    expect(createItemArray([makeImage()], [], BASE, IMAGE_SERVER)).toHaveLength(1)
  })

  it('canvas type is Canvas', () => {
    const [c] = createItemArray([makeImage()], [], BASE, IMAGE_SERVER)
    expect(c.type).toBe('Canvas')
  })

  it('canvas id is 1-indexed', () => {
    const [c] = createItemArray([makeImage()], [], BASE, IMAGE_SERVER)
    expect(c.id).toBe(`${BASE}/iiif/canvas/1`)
  })

  it('canvas label uses none locale', () => {
    const [c] = createItemArray([makeImage()], [], BASE, IMAGE_SERVER)
    expect(c.label).toEqual({ none: ['1'] })
  })

  it('canvas carries correct dimensions', () => {
    const [c] = createItemArray([makeImage({ width: 1200, height: 800 })], [], BASE, IMAGE_SERVER)
    expect(c.width).toBe(1200)
    expect(c.height).toBe(800)
  })

  it('thumbnail height is proportionally rounded', () => {
    const [c] = createItemArray([makeImage({ width: 1000, height: 2000 })], [], BASE, IMAGE_SERVER)
    expect(c.thumbnail[0].width).toBe(100)
    expect(c.thumbnail[0].height).toBe(200)
  })
})

describe('createItemArray — painting annotation (IIIF Image API)', () => {
  it('motivation is painting', () => {
    const [c] = createItemArray([makeImage()], [], BASE, IMAGE_SERVER)
    expect(c.items[0].items[0].motivation).toBe('painting')
  })

  it('body format is image/jpeg', () => {
    const [c] = createItemArray([makeImage()], [], BASE, IMAGE_SERVER)
    expect(c.items[0].items[0].body.format).toBe('image/jpeg')
  })

  it('body id requests the image via the IIIF Image API (full/max/0/default.webp)', () => {
    const [c] = createItemArray([makeImage({ filename_disk: 'abc-123.jpg' })], [], BASE, IMAGE_SERVER)
    expect(c.items[0].items[0].body.id).toBe(`${IMAGE_SERVER}abc-123.jpg/full/max/0/default.webp`)
  })

  it('body carries an ImageService3 service block pointing at the image identifier', () => {
    const [c] = createItemArray([makeImage({ filename_disk: 'abc-123.jpg' })], [], BASE, IMAGE_SERVER)
    expect(c.items[0].items[0].body.service).toEqual([
      { type: 'ImageService3', id: `${IMAGE_SERVER}abc-123.jpg`, profile: 'level1' }
    ])
  })

  it('target points to same canvas id', () => {
    const [c] = createItemArray([makeImage()], [], BASE, IMAGE_SERVER)
    expect(c.items[0].items[0].target).toBe(c.id)
  })
})

describe('createItemArray — rendering', () => {
  it('rendering contains download link with original filename', () => {
    const [c] = createItemArray([makeImage({ id: 'img-1', filename_download: 'page001.jpg' })], [], BASE, IMAGE_SERVER)
    expect(c.rendering[0].id).toBe(`${BASE}/assets/img-1?download=page001.jpg`)
  })

  it('rendering label shows uppercased file extension', () => {
    const [c] = createItemArray([makeImage({ filename_download: 'page001.tif' })], [], BASE, IMAGE_SERVER)
    expect(c.rendering[0].label.en[0]).toContain('TIF')
  })
})

describe('createItemArray — annotation linking', () => {
  it('canvas includes annotations when filename matched', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const anno = makeAnnotation({ filename_download: 'page001.json' })
    const [c] = createItemArray([img], [anno], BASE, IMAGE_SERVER)
    expect(c.annotations).toHaveLength(1)
    expect(c.annotations[0].type).toBe('AnnotationPage')
  })

  it('canvas omits annotations property when no match', () => {
    const [c] = createItemArray([makeImage()], [], BASE, IMAGE_SERVER)
    expect(c.annotations).toBeUndefined()
  })

  it('annotation URL points at the annotation-page rewriting route, not the raw asset', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const anno = makeAnnotation({ id: 'anno-42', filename_download: 'page001.json' })
    const [c] = createItemArray([img], [anno], BASE, IMAGE_SERVER)
    expect(c.annotations[0].id).toBe(`${BASE}/iiif/annotation-page/anno-42`)
  })
})

describe('getAltoSeeAlso', () => {
  it('returns a Dataset seeAlso entry when matched', () => {
    expect(getAltoSeeAlso([makeAlto()], 'page001.xml', BASE)).toEqual({
      id: `${BASE}/assets/alto-uuid-1.xml`,
      type: 'Dataset',
      label: { en: ['ALTO XML'] },
      format: 'text/xml',
      profile: 'http://www.loc.gov/standards/alto/ns-v4#'
    })
  })

  it('returns null when no ALTO file matches', () => {
    expect(getAltoSeeAlso([], 'page001.xml', BASE)).toBeNull()
  })
})

describe('getTextSeeAlso', () => {
  it('returns a Dataset seeAlso entry when matched', () => {
    expect(getTextSeeAlso([makeTxt()], 'page001.txt', BASE)).toEqual({
      id: `${BASE}/assets/txt-uuid-1.txt`,
      type: 'Dataset',
      label: { en: ['Plain text'] },
      format: 'text/plain'
    })
  })

  it('returns null when no text file matches', () => {
    expect(getTextSeeAlso([], 'page001.txt', BASE)).toBeNull()
  })
})

describe('createItemArray — ALTO/text seeAlso linking', () => {
  it('canvas includes seeAlso entries for matched ALTO and text files', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const alto = makeAlto({ filename_download: 'page001.xml' })
    const txt = makeTxt({ filename_download: 'page001.txt' })
    const [c] = createItemArray([img], [], BASE, IMAGE_SERVER, [alto], [txt])
    expect(c.seeAlso).toHaveLength(2)
    expect(c.seeAlso.map((s) => s.format)).toEqual(['text/xml', 'text/plain'])
  })

  it('canvas includes only the matched type when only one is present', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const alto = makeAlto({ filename_download: 'page001.xml' })
    const [c] = createItemArray([img], [], BASE, IMAGE_SERVER, [alto], [])
    expect(c.seeAlso).toHaveLength(1)
    expect(c.seeAlso[0].format).toBe('text/xml')
  })

  it('canvas omits seeAlso property entirely when no ALTO/text files are configured', () => {
    const [c] = createItemArray([makeImage()], [], BASE, IMAGE_SERVER)
    expect(c.seeAlso).toBeUndefined()
  })

  it('canvas omits seeAlso when ALTO/text arrays are present but no filename matches', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const alto = makeAlto({ filename_download: 'other.xml' })
    const [c] = createItemArray([img], [], BASE, IMAGE_SERVER, [alto], [])
    expect(c.seeAlso).toBeUndefined()
  })
})

describe('createItemArray — multiple images', () => {
  it('canvases are numbered sequentially from 1', () => {
    const imgs = [
      makeImage({ id: 'a', filename_download: 'p1.jpg' }),
      makeImage({ id: 'b', filename_download: 'p2.jpg' })
    ]
    const items = createItemArray(imgs, [], BASE, IMAGE_SERVER)
    expect(items[0].id).toBe(`${BASE}/iiif/canvas/1`)
    expect(items[1].id).toBe(`${BASE}/iiif/canvas/2`)
  })
})

// ─── Layer 1: Unit — manifest builder ──────────────────────────────────────

describe('createIiifCollectionJson', () => {
  const args = (overrides = {}) => ({
    canvasLabel: 'Raamat 1',
    items: [],
    collection: 'books',
    fileId: 'item-uuid',
    iiifMeta: [['Autor', 'Tammsaare']],
    sorted: true,
    hasAnnotations: false,
    directusEndpoint: BASE,
    ...overrides
  })

  const build = (o = {}) => {
    const a = args(o)
    return createIiifCollectionJson(
      a.canvasLabel, a.items, a.collection, a.fileId,
      a.iiifMeta, a.sorted, a.hasAnnotations, a.directusEndpoint
    )
  }

  it('@context is IIIF Presentation API v3', () => {
    expect(build()['@context']).toBe('http://iiif.io/api/presentation/3/context.json')
  })

  it('type is Manifest', () => {
    expect(build().type).toBe('Manifest')
  })

  it('id is correctly formed from endpoint + collection + fileId', () => {
    expect(build().id).toBe(`${BASE}/iiif/manifest/books/item-uuid`)
  })

  it('label uses et locale', () => {
    expect(build().label).toEqual({ et: ['Raamat 1'] })
  })

  it('metadata key-value pairs are mapped to et locale', () => {
    expect(build().metadata[0]).toEqual({
      label: { et: ['Autor'] },
      value: { et: ['Tammsaare'] }
    })
  })

  it('service block is absent when hasAnnotations is false', () => {
    expect(build({ hasAnnotations: false }).service).toBeUndefined()
  })

  it('service block is present when hasAnnotations is true', () => {
    const manifest = build({ hasAnnotations: true })
    expect(manifest.service).toBeDefined()
    expect(manifest.service.profile).toBe('http://iiif.io/api/search/1/search')
  })

  it('service @id mirrors the manifest id shape, with /search/ instead of /manifest/', () => {
    const manifest = build({ hasAnnotations: true })
    expect(manifest.service['@id']).toBe(`${BASE}/iiif/search/books/item-uuid`)
  })

  it('multiple metadata pairs all appear', () => {
    const manifest = build({ iiifMeta: [['A', '1'], ['B', '2']] })
    expect(manifest.metadata).toHaveLength(2)
  })

  it('omits metadata rows whose value is null', () => {
    const manifest = build({ iiifMeta: [['Autor', 'Tammsaare'], ['Fond', null]] })
    expect(manifest.metadata).toHaveLength(1)
    expect(manifest.metadata[0].label).toEqual({ et: ['Autor'] })
  })

  it('omits metadata rows whose value is undefined', () => {
    const manifest = build({ iiifMeta: [['Autor', 'Tammsaare'], ['Fond', undefined]] })
    expect(manifest.metadata).toHaveLength(1)
  })
})

// ─── Layer 1: Unit — OCR ingest + search ───────────────────────────────────

describe('extractOcrEntriesFromAnnotationPage', () => {
  const region = (canvas, x, y, w, h) => `${canvas}#xywh=${x},${y},${w},${h}`

  it('extracts text + region from a `resources` (IIIF v2 AnnotationList) shape', () => {
    const page = {
      resources: [
        {
          resource: { chars: 'Hello world' },
          on: region('http://test.local/iiif/canvas/1', 10, 20, 100, 30)
        }
      ]
    }
    const entries = extractOcrEntriesFromAnnotationPage(page, 'books', '26')
    expect(entries).toEqual([
      {
        text: 'Hello world',
        x: 10,
        y: 20,
        width: 100,
        height: 30,
        canvas: 'http://test.local/iiif/canvas/1',
        manifest: '',
        collection_name: 'books',
        collection_id: '26'
      }
    ])
  })

  it('extracts text + region from an `items`/`target`/`body.value` (IIIF v3) shape', () => {
    const page = {
      items: [
        {
          body: { value: 'Tere maailm' },
          target: region('http://test.local/iiif/canvas/1', 1, 2, 3, 4)
        }
      ]
    }
    const entries = extractOcrEntriesFromAnnotationPage(page, 'books', '26')
    expect(entries[0].text).toBe('Tere maailm')
    expect(entries[0]).toMatchObject({ x: 1, y: 2, width: 3, height: 4 })
  })

  it('falls back to `annotations` array when neither `resources` nor `items` is present', () => {
    const page = {
      annotations: [
        { resource: { chars: 'x' }, on: region('c1', 0, 0, 1, 1) }
      ]
    }
    expect(extractOcrEntriesFromAnnotationPage(page, 'books', '26')).toHaveLength(1)
  })

  it('carries the source manifest id through from `within["@id"]`', () => {
    const page = {
      resources: [
        {
          resource: { chars: 'x' },
          on: region('c1', 0, 0, 1, 1),
          within: { '@id': 'http://test.local/iiif/manifest/books/26' }
        }
      ]
    }
    expect(extractOcrEntriesFromAnnotationPage(page, 'books', '26')[0].manifest).toBe('http://test.local/iiif/manifest/books/26')
  })

  it('skips entries with no usable text', () => {
    const page = { resources: [{ resource: {}, on: region('c1', 0, 0, 1, 1) }] }
    expect(extractOcrEntriesFromAnnotationPage(page, 'books', '26')).toHaveLength(0)
  })

  it('skips entries with no region (`on`/`target`)', () => {
    const page = { resources: [{ resource: { chars: 'x' } }] }
    expect(extractOcrEntriesFromAnnotationPage(page, 'books', '26')).toHaveLength(0)
  })

  it('skips entries whose xywh coordinates do not parse to four numbers', () => {
    const page = { resources: [{ resource: { chars: 'x' }, on: 'c1#xywh=1,2,3' }] }
    expect(extractOcrEntriesFromAnnotationPage(page, 'books', '26')).toHaveLength(0)
  })

  it('returns an empty array when there are no resources at all', () => {
    expect(extractOcrEntriesFromAnnotationPage({}, 'books', '26')).toEqual([])
  })

  describe('rewriting canvas/manifest origin to the current environment', () => {
    // annotation_files are converted upstream with an absolute origin baked
    // in for whichever host was current at conversion time. Since the files
    // are shared across environments, that origin can point at a different
    // environment than the one running /parse-ocr right now - it must be
    // rewritten, or search results end up linking back into the wrong
    // environment entirely (e.g. dev search results pointing at prod urls).
    const page = {
      resources: [
        {
          resource: { chars: 'x' },
          on: region('https://db.dl.tlu.ee/iiif/canvas/1', 10, 20, 30, 40),
          within: { '@id': 'https://db.dl.tlu.ee/iiif/manifest/magistraat/26' }
        }
      ]
    }

    it('leaves canvas/manifest untouched when no directusEndpoint is given (back-compat)', () => {
      const [entry] = extractOcrEntriesFromAnnotationPage(page, 'magistraat', '26')
      expect(entry.canvas).toBe('https://db.dl.tlu.ee/iiif/canvas/1')
      expect(entry.manifest).toBe('https://db.dl.tlu.ee/iiif/manifest/magistraat/26')
    })

    it('rewrites the canvas origin to directusEndpoint, keeping the path', () => {
      const [entry] = extractOcrEntriesFromAnnotationPage(page, 'magistraat', '26', 'https://dev.db.dl.tlu.ee')
      expect(entry.canvas).toBe('https://dev.db.dl.tlu.ee/iiif/canvas/1')
    })

    it('rewrites the manifest origin to directusEndpoint, keeping the path', () => {
      const [entry] = extractOcrEntriesFromAnnotationPage(page, 'magistraat', '26', 'https://dev.db.dl.tlu.ee')
      expect(entry.manifest).toBe('https://dev.db.dl.tlu.ee/iiif/manifest/magistraat/26')
    })

    it('leaves a non-URL canvas value untouched rather than throwing', () => {
      const oddPage = { resources: [{ resource: { chars: 'x' }, on: region('not-a-url', 0, 0, 1, 1) }] }
      const [entry] = extractOcrEntriesFromAnnotationPage(oddPage, 'books', '26', 'https://dev.db.dl.tlu.ee')
      expect(entry.canvas).toBe('not-a-url')
    })
  })
})

describe('buildIiifSearchResponse', () => {
  const entry = (overrides = {}) => ({
    id: 1,
    text: 'Hello world',
    x: 10,
    y: 20,
    width: 100,
    height: 30,
    canvas: `${BASE}/iiif/canvas/1`,
    manifest: `${BASE}/iiif/manifest/books/26`,
    ...overrides
  })

  it('@context is the IIIF Search API v1 context', () => {
    const r = buildIiifSearchResponse([], `${BASE}/iiif/search/books/26?q=x`, BASE)
    expect(r['@context']).toBe('http://iiif.io/api/search/1/context.json')
  })

  it('@id echoes the request URL', () => {
    const url = `${BASE}/iiif/search/books/26?q=hello`
    const r = buildIiifSearchResponse([], url, BASE)
    expect(r['@id']).toBe(url)
  })

  it('within.total matches the number of entries', () => {
    const r = buildIiifSearchResponse([entry(), entry({ id: 2 })], `${BASE}/iiif/search/books/26?q=x`, BASE)
    expect(r.within).toEqual({ '@type': 'sc:Layer', total: 2 })
  })

  it('each resource is an oa:Annotation with ContentAsText matching the entry text', () => {
    const r = buildIiifSearchResponse([entry()], `${BASE}/iiif/search/books/26?q=x`, BASE)
    expect(r.resources[0]).toMatchObject({
      '@type': 'oa:Annotation',
      motivation: 'sc:painting',
      resource: { '@type': 'cnt:ContentAsText', format: 'text/plain', chars: 'Hello world' }
    })
  })

  it('resource `on` is built from canvas + xywh', () => {
    const r = buildIiifSearchResponse([entry()], `${BASE}/iiif/search/books/26?q=x`, BASE)
    expect(r.resources[0].on).toBe(`${BASE}/iiif/canvas/1#xywh=10,20,100,30`)
  })

  it('resource id is namespaced under /iiif/annotation/ on the given endpoint', () => {
    const r = buildIiifSearchResponse([entry({ id: 42 })], `${BASE}/iiif/search/books/26?q=x`, BASE)
    expect(r.resources[0]['@id']).toBe(`${BASE}/iiif/annotation/42`)
  })

  it('each hit references its resource id and carries the matched text', () => {
    const r = buildIiifSearchResponse([entry({ id: 42 })], `${BASE}/iiif/search/books/26?q=x`, BASE)
    expect(r.hits[0]).toEqual({
      '@type': 'search:Hit',
      match: 'Hello world',
      annotations: [`${BASE}/iiif/annotation/42`],
      on: `${BASE}/iiif/canvas/1#xywh=10,20,100,30`
    })
  })
})

describe('rewriteAnnotationPageOrigin', () => {
  // same shared-storage problem as ocr_entries: annotation_files carry
  // whatever origin they were converted against, which can differ from the
  // environment actually serving them right now.
  const page = () => ({
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    '@id': 'https://db.dl.tlu.ee/iiif/0001_001.json',
    '@type': 'sc:AnnotationList',
    resources: [
      {
        '@type': 'oa:Annotation',
        motivation: 'sc:painting',
        resource: { '@id': 'https://db.dl.tlu.ee/iiif/0001_001.json-1', '@type': 'cnt:ContentAsText', format: 'text/plain', chars: 'Der Henneppspinner' },
        on: 'https://db.dl.tlu.ee/iiif/canvas/1#xywh=1210,752,1392,210',
        within: { '@id': 'https://db.dl.tlu.ee/iiif/manifest/magistraat/26', '@type': 'sc:Manifest' }
      }
    ]
  })

  it('rewrites the annotation page\'s own top-level id/@id', () => {
    const r = rewriteAnnotationPageOrigin(page(), BASE)
    expect(r['@id']).toBe(`${BASE}/iiif/0001_001.json`)
  })

  it('rewrites each resource\'s `on` target, keeping the #xywh= fragment', () => {
    const r = rewriteAnnotationPageOrigin(page(), BASE)
    expect(r.resources[0].on).toBe(`${BASE}/iiif/canvas/1#xywh=1210,752,1392,210`)
  })

  it('rewrites each resource\'s `within["@id"]`, preserving other within fields', () => {
    const r = rewriteAnnotationPageOrigin(page(), BASE)
    expect(r.resources[0].within).toEqual({ '@id': `${BASE}/iiif/manifest/magistraat/26`, '@type': 'sc:Manifest' })
  })

  it('leaves everything else about a resource untouched (e.g. resource.chars, resource["@id"])', () => {
    const r = rewriteAnnotationPageOrigin(page(), BASE)
    expect(r.resources[0].resource).toEqual({
      '@id': 'https://db.dl.tlu.ee/iiif/0001_001.json-1',
      '@type': 'cnt:ContentAsText',
      format: 'text/plain',
      chars: 'Der Henneppspinner'
    })
  })

  it('also rewrites an IIIF v3 `target`/`partOf.id` shape', () => {
    const v3Page = {
      id: 'https://db.dl.tlu.ee/iiif/page.json',
      items: [
        {
          body: { value: 'x' },
          target: 'https://db.dl.tlu.ee/iiif/canvas/1#xywh=0,0,1,1',
          partOf: { id: 'https://db.dl.tlu.ee/iiif/manifest/books/1' }
        }
      ]
    }
    const r = rewriteAnnotationPageOrigin(v3Page, BASE)
    expect(r.id).toBe(`${BASE}/iiif/page.json`)
    expect(r.items[0].target).toBe(`${BASE}/iiif/canvas/1#xywh=0,0,1,1`)
    expect(r.items[0].partOf.id).toBe(`${BASE}/iiif/manifest/books/1`)
  })

  it('returns the input unchanged when no directusEndpoint is given (back-compat)', () => {
    const input = page()
    expect(rewriteAnnotationPageOrigin(input, undefined)).toBe(input)
  })

  it('does not mutate the input object', () => {
    const input = page()
    const originalOn = input.resources[0].on
    rewriteAnnotationPageOrigin(input, BASE)
    expect(input.resources[0].on).toBe(originalOn)
  })
})

// ─── Layer 2: Integration — note ───────────────────────────────────────────
// Full handler integration tests (mocked ItemsService) live in src/handler.test.js
// and require a Directus schema stub. See test plan in README.
