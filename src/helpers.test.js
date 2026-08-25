import { describe, it, expect } from 'vitest'
import {
  findIdByFile,
  getAnnotations,
  getAltoSeeAlso,
  getTextSeeAlso,
  createItemArray,
  createIiifCollectionJson
} from './helpers.js'

const BASE = 'http://test.local'

const makeImage = (overrides = {}) => ({
  id: 'img-uuid-1',
  title: 'Page 001',
  filename_download: 'page001.jpg',
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
  it('returns AnnotationPage with correct asset URL when found', () => {
    expect(getAnnotations([makeAnnotation()], 'page001.json', BASE)).toEqual({
      id: `${BASE}/assets/anno-uuid-1.json`,
      type: 'AnnotationPage'
    })
  })

  it('returns null when annotation not found', () => {
    expect(getAnnotations([], 'page001.json', BASE)).toBeNull()
  })
})

describe('createItemArray — canvas structure', () => {
  it('returns one canvas per image', () => {
    expect(createItemArray([makeImage()], [], BASE)).toHaveLength(1)
  })

  it('canvas type is Canvas', () => {
    const [c] = createItemArray([makeImage()], [], BASE)
    expect(c.type).toBe('Canvas')
  })

  it('canvas id is 1-indexed', () => {
    const [c] = createItemArray([makeImage()], [], BASE)
    expect(c.id).toBe(`${BASE}/iiif/canvas/1`)
  })

  it('canvas label uses none locale', () => {
    const [c] = createItemArray([makeImage()], [], BASE)
    expect(c.label).toEqual({ none: ['1'] })
  })

  it('canvas carries correct dimensions', () => {
    const [c] = createItemArray([makeImage({ width: 1200, height: 800 })], [], BASE)
    expect(c.width).toBe(1200)
    expect(c.height).toBe(800)
  })

  it('thumbnail height is proportionally rounded', () => {
    const [c] = createItemArray([makeImage({ width: 1000, height: 2000 })], [], BASE)
    expect(c.thumbnail[0].width).toBe(100)
    expect(c.thumbnail[0].height).toBe(200)
  })
})

describe('createItemArray — painting annotation', () => {
  it('motivation is painting', () => {
    const [c] = createItemArray([makeImage()], [], BASE)
    expect(c.items[0].items[0].motivation).toBe('painting')
  })

  it('body format is image/jpeg', () => {
    const [c] = createItemArray([makeImage()], [], BASE)
    expect(c.items[0].items[0].body.format).toBe('image/jpeg')
  })

  it('body URL uses asset endpoint with jpg format', () => {
    const [c] = createItemArray([makeImage({ id: 'img-1' })], [], BASE)
    expect(c.items[0].items[0].body.id).toBe(`${BASE}/assets/img-1?format=jpg`)
  })

  it('target points to same canvas id', () => {
    const [c] = createItemArray([makeImage()], [], BASE)
    expect(c.items[0].items[0].target).toBe(c.id)
  })
})

describe('createItemArray — rendering', () => {
  it('rendering contains download link with original filename', () => {
    const [c] = createItemArray([makeImage({ id: 'img-1', filename_download: 'page001.jpg' })], [], BASE)
    expect(c.rendering[0].id).toBe(`${BASE}/assets/img-1?download=page001.jpg`)
  })

  it('rendering label shows uppercased file extension', () => {
    const [c] = createItemArray([makeImage({ filename_download: 'page001.tif' })], [], BASE)
    expect(c.rendering[0].label.en[0]).toContain('TIF')
  })
})

describe('createItemArray — annotation linking', () => {
  it('canvas includes annotations when filename matched', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const anno = makeAnnotation({ filename_download: 'page001.json' })
    const [c] = createItemArray([img], [anno], BASE)
    expect(c.annotations).toHaveLength(1)
    expect(c.annotations[0].type).toBe('AnnotationPage')
  })

  it('canvas omits annotations property when no match', () => {
    const [c] = createItemArray([makeImage()], [], BASE)
    expect(c.annotations).toBeUndefined()
  })

  it('annotation URL is asset id + .json', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const anno = makeAnnotation({ id: 'anno-42', filename_download: 'page001.json' })
    const [c] = createItemArray([img], [anno], BASE)
    expect(c.annotations[0].id).toBe(`${BASE}/assets/anno-42.json`)
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
    const [c] = createItemArray([img], [], BASE, [alto], [txt])
    expect(c.seeAlso).toHaveLength(2)
    expect(c.seeAlso.map((s) => s.format)).toEqual(['text/xml', 'text/plain'])
  })

  it('canvas includes only the matched type when only one is present', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const alto = makeAlto({ filename_download: 'page001.xml' })
    const [c] = createItemArray([img], [], BASE, [alto], [])
    expect(c.seeAlso).toHaveLength(1)
    expect(c.seeAlso[0].format).toBe('text/xml')
  })

  it('canvas omits seeAlso property entirely when no ALTO/text files are configured', () => {
    const [c] = createItemArray([makeImage()], [], BASE)
    expect(c.seeAlso).toBeUndefined()
  })

  it('canvas omits seeAlso when ALTO/text arrays are present but no filename matches', () => {
    const img = makeImage({ filename_download: 'page001.jpg' })
    const alto = makeAlto({ filename_download: 'other.xml' })
    const [c] = createItemArray([img], [], BASE, [alto], [])
    expect(c.seeAlso).toBeUndefined()
  })
})

describe('createItemArray — multiple images', () => {
  it('canvases are numbered sequentially from 1', () => {
    const imgs = [
      makeImage({ id: 'a', filename_download: 'p1.jpg' }),
      makeImage({ id: 'b', filename_download: 'p2.jpg' })
    ]
    const items = createItemArray(imgs, [], BASE)
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

// ─── Layer 2: Integration — note ───────────────────────────────────────────
// Full handler integration tests (mocked ItemsService) live in src/handler.test.js
// and require a Directus schema stub. See test plan in README.
