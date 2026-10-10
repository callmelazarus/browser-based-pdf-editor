import { describe, expect, it } from 'vitest'
import { effectiveRenderScale, MAX_CANVAS_PIXELS, PdfLoadError, pdfjsAssetOptions, toLoadError } from './pdf-document'

describe('toLoadError', () => {
  it('maps a pdf.js password exception', () => {
    const e = toLoadError(Object.assign(new Error('No password given'), { name: 'PasswordException' }))
    expect(e).toBeInstanceOf(PdfLoadError)
    expect(e.kind).toBe('password')
    expect(e.message).toMatch(/password/i)
  })

  it('maps invalid, format and missing exceptions to "not a valid PDF"', () => {
    for (const name of ['InvalidPDFException', 'FormatError', 'MissingPDFException']) {
      const e = toLoadError(Object.assign(new Error('x'), { name }))
      expect(e.kind).toBe('invalid')
      expect(e.message).toMatch(/valid PDF/)
    }
  })

  it('falls back to a generic message', () => {
    const e = toLoadError(new Error('boom'))
    expect(e.kind).toBe('unknown')
  })
})

describe('effectiveRenderScale', () => {
  const W = 612
  const H = 792

  it('leaves a normal page at scale * dpr', () => {
    expect(effectiveRenderScale(W, H, 1, 2)).toBe(2)
    expect(effectiveRenderScale(W, H, 1.5, 1)).toBe(1.5)
  })

  it('reduces the dpr factor first when over the cap', () => {
    const s = effectiveRenderScale(W, H, 4, 3)
    expect(s).toBeLessThan(12)
    expect(s).toBeGreaterThanOrEqual(4)
    expect(Math.floor(W * s) * Math.floor(H * s)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS)
  })

  it('reduces the scale itself only when even dpr 1 is over the cap', () => {
    const s = effectiveRenderScale(W, H, 20, 1)
    expect(s).toBeLessThan(20)
    expect(Math.floor(W * s) * Math.floor(H * s)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS)
  })

  it('keeps a huge page within the cap and never returns zero or NaN', () => {
    const s = effectiveRenderScale(14400, 14400, 1, 2)
    expect(s).toBeGreaterThan(0)
    expect(Number.isFinite(s)).toBe(true)
    expect(Math.floor(14400 * s) * Math.floor(14400 * s)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS)
    for (const bad of [effectiveRenderScale(0, 0, 1, 2), effectiveRenderScale(W, H, 0, 0), effectiveRenderScale(NaN, H, 1, 1)]) {
      expect(bad).toBeGreaterThan(0)
      expect(Number.isFinite(bad)).toBe(true)
    }
  })
})

describe('pdfjsAssetOptions', () => {
  it('points every decoder asset at a same-origin, slash-terminated path under the base', () => {
    expect(pdfjsAssetOptions('/app/')).toEqual({
      wasmUrl: '/app/pdfjs/wasm/', cMapUrl: '/app/pdfjs/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/app/pdfjs/standard_fonts/', iccUrl: '/app/pdfjs/iccs/',
    })
    expect(pdfjsAssetOptions('/').wasmUrl).toBe('/pdfjs/wasm/')
    expect(pdfjsAssetOptions('/x').wasmUrl).toBe('/x/pdfjs/wasm/')
  })
})
